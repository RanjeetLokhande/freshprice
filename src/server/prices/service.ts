import 'server-only';
import type { ServerSupabase } from '@/lib/supabase/server';
import type {
  BulkPricesResult,
  DailyPrices,
  PriceHistoryQuery,
  PriceHistoryRow,
} from '@/shared/prices';
import type { PageMeta } from '@/shared/api';
import type { z } from 'zod';
import type { bulkPricesSchema } from '@/shared/prices';

const money = (v: number | string) => Number(v).toFixed(2);

/**
 * Every active item with its pricing-unit price for the date and the latest
 * earlier price. Three queries in parallel, independent of item count.
 */
export async function loadDailyPrices(supabase: ServerSupabase, date: string): Promise<DailyPrices> {
  const [items, today, previous] = await Promise.all([
    supabase
      .from('items')
      .select('id, pricing_unit_id')
      .eq('active', true)
      .is('deleted_at', null)
      .order('sort_order')
      .order('name'),
    supabase.from('item_prices').select('id, item_id, unit_id, price, version, notes, updated_at').eq('price_date', date),
    supabase.rpc('latest_prices_before', { p_date: date }),
  ]);
  for (const r of [items, today, previous]) if (r.error) throw r.error;

  const key = (itemId: number, unitId: number) => `${itemId}:${unitId}`;
  const todayMap = new Map((today.data ?? []).map((p) => [key(p.item_id, p.unit_id), p]));
  const prevMap = new Map((previous.data ?? []).map((p) => [key(p.item_id, p.unit_id), p]));

  return {
    date,
    rows: (items.data ?? []).map((i) => {
      const cur = todayMap.get(key(i.id, i.pricing_unit_id));
      const prev = prevMap.get(key(i.id, i.pricing_unit_id));
      return {
        itemId: i.id,
        unitId: i.pricing_unit_id,
        current: cur
          ? { id: cur.id, price: money(cur.price), version: cur.version, notes: cur.notes, updatedAt: cur.updated_at }
          : null,
        previous: prev ? { date: prev.price_date, price: money(prev.price) } : null,
      };
    }),
  };
}

export async function saveBulkPrices(
  supabase: ServerSupabase,
  input: z.output<typeof bulkPricesSchema>,
): Promise<BulkPricesResult> {
  const { data, error } = await supabase.rpc('upsert_prices', {
    p_date: input.date,
    p_rows: input.rows.map((r) => ({
      itemId: r.itemId,
      unitId: r.unitId,
      price: r.price,
      notes: r.notes ?? null,
      version: r.version ?? null,
    })),
    p_atomic: input.mode === 'atomic',
  });
  if (error) throw error;
  return data as unknown as BulkPricesResult;
}

export async function loadPriceHistory(
  supabase: ServerSupabase,
  q: PriceHistoryQuery,
): Promise<{ rows: PriceHistoryRow[]; meta: PageMeta }> {
  let query = supabase
    .from('item_prices')
    .select(
      'id, price_date, price, notes, updated_at, item_id, item:items!inner(name, category_id), unit:units!item_prices_unit_id_fkey(symbol), revisions:item_price_revisions(count)',
      { count: 'exact' },
    );

  if (q.itemId) query = query.eq('item_id', q.itemId);
  if (q.categoryId) query = query.eq('item.category_id', q.categoryId);
  if (q.from) query = query.gte('price_date', q.from);
  if (q.to) query = query.lte('price_date', q.to);

  const from = (q.page - 1) * q.pageSize;
  const { data, error, count } = await query
    .order('price_date', { ascending: false })
    .order('item_id')
    .range(from, from + q.pageSize - 1);
  if (error) throw error;

  type Row = {
    id: number;
    price_date: string;
    price: number;
    notes: string | null;
    updated_at: string;
    item_id: number;
    item: { name: string; category_id: number };
    unit: { symbol: string } | null;
    revisions: { count: number }[];
  };

  return {
    rows: ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      date: r.price_date,
      itemId: r.item_id,
      itemName: r.item.name,
      categoryId: r.item.category_id,
      price: money(r.price),
      unitSymbol: r.unit?.symbol ?? '',
      notes: r.notes,
      revisions: r.revisions?.[0]?.count ?? 0,
      updatedAt: r.updated_at,
    })),
    meta: { page: q.page, pageSize: q.pageSize, total: count ?? 0 },
  };
}
