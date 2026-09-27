import 'server-only';
import { calculateLine, calculateTotals } from '@/domain/calculate';
import { formatBusinessDate } from '@/domain/business-date';
import { DomainError } from '@/domain/errors';
import { indexUnits, type ItemConversion } from '@/domain/units';
import type { ServerSupabase } from '@/lib/supabase/server';
import type { FieldErrors } from '@/shared/api';
import type { CalculationLineInput } from '@/shared/calculations';
import { parseSettings, type AppSettings } from '@/shared/settings';
import { ApiError } from '../api/errors';

/** A fully computed line, ready to be snapshotted by save_calculation(). */
export interface ComputedLine {
  itemId: number;
  itemName: string;
  categoryName: string | null;
  quantity: string;
  unitId: number;
  unitSymbol: string;
  normalizedQuantity: string;
  price: string;
  priceUnitId: number;
  priceUnitSymbol: string;
  priceId: number;
  amount: string;
}

/**
 * Resolves prices and computes every line with the shared domain engine.
 * A fixed number of queries regardless of line count (no N+1). Collects ALL
 * line errors so the UI can highlight every problem at once.
 */
export async function computeCalculation(
  supabase: ServerSupabase,
  date: string,
  lines: { itemId: number; unitId: number; quantity: string }[],
  adjustment: string,
): Promise<{ lines: ComputedLine[]; subtotal: string; grandTotal: string; settings: AppSettings }> {
  const itemIds = [...new Set(lines.map((l) => l.itemId))];

  const [settingsRes, itemsRes, unitsRes, convRes, pricesRes] = await Promise.all([
    supabase.from('app_settings').select('key, value'),
    supabase
      .from('items')
      .select('id, name, active, deleted_at, pricing_unit_id, category:categories(name)')
      .in('id', itemIds),
    supabase.from('units').select('id, symbol, unit_type_id, base_unit_id, conversion_factor, active'),
    supabase.from('item_unit_conversions').select('item_id, from_unit_id, to_unit_id, factor').in('item_id', itemIds).eq('active', true),
    supabase.from('item_prices').select('id, item_id, unit_id, price').eq('price_date', date).in('item_id', itemIds),
  ]);
  for (const r of [settingsRes, itemsRes, unitsRes, convRes, pricesRes]) if (r.error) throw r.error;

  const settings = parseSettings(settingsRes.data ?? []);
  const units = unitsRes.data ?? [];
  const unitIndex = indexUnits(
    units.map((u) => ({
      id: u.id,
      symbol: u.symbol,
      unitTypeId: u.unit_type_id,
      baseUnitId: u.base_unit_id,
      conversionFactor: String(u.conversion_factor),
    })),
  );
  const unitById = new Map(units.map((u) => [u.id, u]));
  type ItemRow = { id: number; name: string; active: boolean; deleted_at: string | null; pricing_unit_id: number; category: { name: string } | null };
  const itemById = new Map(((itemsRes.data ?? []) as unknown as ItemRow[]).map((i) => [i.id, i]));

  const conversionsByItem = new Map<number, ItemConversion[]>();
  for (const c of convRes.data ?? []) {
    const list = conversionsByItem.get(c.item_id) ?? [];
    list.push({ fromUnitId: c.from_unit_id, toUnitId: c.to_unit_id, factor: String(c.factor) });
    conversionsByItem.set(c.item_id, list);
  }
  const priceByItemUnit = new Map((pricesRes.data ?? []).map((p) => [`${p.item_id}:${p.unit_id}`, p]));

  const errors: FieldErrors = {};
  const add = (path: string, message: string) => (errors[path] ??= []).push(message);
  const seen = new Map<number, number>();
  const computed: ComputedLine[] = [];

  lines.forEach((line, i) => {
    const item = itemById.get(line.itemId);
    if (!item || item.deleted_at || !item.active) return add(`lines.${i}.itemId`, 'This item is not available.');

    if (settings.duplicateLinePolicy === 'merge') {
      const first = seen.get(line.itemId);
      if (first !== undefined) return add(`lines.${i}.itemId`, `${item.name} is already on line ${first + 1}.`);
      seen.set(line.itemId, i);
    }

    const unit = unitById.get(line.unitId);
    if (!unit || !unit.active) return add(`lines.${i}.unitId`, 'Choose a valid unit.');

    const price = priceByItemUnit.get(`${item.id}:${item.pricing_unit_id}`);
    if (!price) {
      return add(`lines.${i}.price`, `Price not available for ${item.name} on ${formatBusinessDate(date)}.`);
    }

    try {
      const r = calculateLine(
        {
          quantity: line.quantity,
          unitId: line.unitId,
          price: String(price.price),
          priceUnitId: item.pricing_unit_id,
          itemConversions: conversionsByItem.get(item.id),
        },
        unitIndex,
        settings.money,
      );
      computed.push({
        itemId: item.id,
        itemName: item.name,
        categoryName: item.category?.name ?? null,
        quantity: r.quantity,
        unitId: r.unitId,
        unitSymbol: unit.symbol,
        normalizedQuantity: r.normalizedQuantity,
        price: r.price,
        priceUnitId: r.priceUnitId,
        priceUnitSymbol: unitById.get(r.priceUnitId)?.symbol ?? '',
        priceId: price.id,
        amount: r.amount,
      });
    } catch (e) {
      if (e instanceof DomainError) return add(`lines.${i}.${e.field ?? 'quantity'}`, e.message);
      throw e;
    }
  });

  if (Object.keys(errors).length > 0) {
    throw new ApiError('VALIDATION_ERROR', 'Some lines need attention.', errors);
  }

  const totals = calculateTotals(
    computed.map((l) => l.amount),
    adjustment,
    settings.money,
  );
  return { lines: computed, subtotal: totals.subtotal, grandTotal: totals.grandTotal, settings };
}

export type { CalculationLineInput };
