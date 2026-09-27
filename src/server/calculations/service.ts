import 'server-only';
import type { z } from 'zod';
import type { ServerSupabase } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import type { PageMeta } from '@/shared/api';
import type {
  CalculationDto,
  CalculationListQuery,
  CalculationSummaryDto,
  calculationInputSchema,
} from '@/shared/calculations';
import { ApiError } from '../api/errors';
import { computeCalculation } from './engine';

const money = (v: number | string) => Number(v).toFixed(2);

type SaveInput = z.output<typeof calculationInputSchema>;

/** Create (id undefined) or update a draft; optionally finalize in the same transaction. */
export async function saveCalculation(
  supabase: ServerSupabase,
  input: SaveInput,
  opts: { id?: number; version?: number; idempotencyKey?: string | null } = {},
): Promise<CalculationDto> {
  const computed = await computeCalculation(supabase, input.date, input.lines, input.adjustment);

  const { data, error } = await supabase.rpc('save_calculation', {
    p_id: opts.id ?? null,
    p_version: opts.version ?? null,
    p_date: input.date,
    p_notes: input.notes ?? null,
    p_adjustment: Number(input.adjustment),
    p_lines: computed.lines as unknown as Json,
    p_finalize: input.finalize,
    p_idempotency_key: opts.idempotencyKey ?? null,
  });
  if (error) throw error;

  const result = data as unknown as { id: number; replayed: boolean };
  const calc = await getCalculation(supabase, result.id);
  return { ...calc, replayed: result.replayed };
}

export async function getCalculation(supabase: ServerSupabase, id: number): Promise<CalculationDto> {
  const { data, error } = await supabase
    .from('calculations')
    .select('*, lines:calculation_items(*)')
    .eq('id', id)
    .order('line_no', { referencedTable: 'calculation_items' })
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError('NOT_FOUND', 'Calculation not found.');

  return {
    id: data.id,
    referenceNumber: data.reference_number,
    date: data.calculation_date,
    status: data.status,
    subtotal: money(data.subtotal),
    adjustment: money(data.adjustment),
    grandTotal: money(data.grand_total),
    notes: data.notes,
    version: data.version,
    createdBy: data.created_by,
    createdAt: data.created_at,
    finalizedAt: data.finalized_at,
    cancelledAt: data.cancelled_at,
    cancelReason: data.cancel_reason,
    lines: (data.lines ?? []).map((l) => ({
      lineNo: l.line_no,
      itemId: l.item_id,
      itemName: l.item_name_snapshot,
      categoryName: l.category_name_snapshot,
      quantity: String(Number(l.quantity)),
      unitId: l.unit_id,
      unitSymbol: l.unit_symbol_snapshot,
      normalizedQuantity: String(Number(l.normalized_quantity)),
      price: money(l.price),
      priceUnitId: l.price_unit_id,
      priceUnitSymbol: l.price_unit_symbol_snapshot,
      amount: money(l.amount),
    })),
  };
}

export async function listCalculations(
  supabase: ServerSupabase,
  q: CalculationListQuery,
): Promise<{ rows: CalculationSummaryDto[]; meta: PageMeta }> {
  // !inner join only when filtering by item, so plain lists count every calculation
  const select = q.itemId
    ? 'id, reference_number, calculation_date, status, grand_total, created_at, lines:calculation_items!inner(item_id), line_count:calculation_items(count)'
    : 'id, reference_number, calculation_date, status, grand_total, created_at, line_count:calculation_items(count)';

  let query = supabase.from('calculations').select(select, { count: 'exact' });
  if (q.from) query = query.gte('calculation_date', q.from);
  if (q.to) query = query.lte('calculation_date', q.to);
  if (q.status) query = query.eq('status', q.status);
  if (q.itemId) query = query.eq('lines.item_id', q.itemId);

  const from = (q.page - 1) * q.pageSize;
  const { data, error, count } = await query
    .order('calculation_date', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + q.pageSize - 1);
  if (error) throw error;

  type Row = {
    id: number;
    reference_number: string;
    calculation_date: string;
    status: CalculationDto['status'];
    grand_total: number;
    created_at: string;
    line_count: { count: number }[];
  };
  return {
    rows: ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      referenceNumber: r.reference_number,
      date: r.calculation_date,
      status: r.status,
      grandTotal: money(r.grand_total),
      lineCount: r.line_count?.[0]?.count ?? 0,
      createdAt: r.created_at,
    })),
    meta: { page: q.page, pageSize: q.pageSize, total: count ?? 0 },
  };
}

export async function finalizeCalculation(supabase: ServerSupabase, id: number, version: number) {
  const { error } = await supabase.rpc('finalize_calculation', { p_id: id, p_version: version });
  if (error) throw error;
  return getCalculation(supabase, id);
}

export async function cancelCalculation(supabase: ServerSupabase, id: number, version: number, reason: string) {
  const { error } = await supabase.rpc('cancel_calculation', { p_id: id, p_version: version, p_reason: reason });
  if (error) throw error;
  return getCalculation(supabase, id);
}

export async function deleteDraft(supabase: ServerSupabase, id: number) {
  const { data, error } = await supabase
    .from('calculations')
    .delete()
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError('NOT_FOUND', 'Draft not found (only your own drafts can be deleted).');
  return { id };
}
