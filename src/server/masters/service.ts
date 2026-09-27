import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { indexUnits, isCompatible } from '@/domain/units';
import type { ServerSupabase } from '@/lib/supabase/server';
import type { FieldDefinitionDto } from '@/shared/bootstrap';
import { buildMasterSchema } from '@/shared/master-schema';
import { getMaster, type MasterDefinition, type MasterRow } from '@/shared/masters';
import type { PageMeta } from '@/shared/api';
import { ApiError } from '../api/errors';

// Tables are chosen at runtime from the registry, so use the untyped client here.
const db = (s: ServerSupabase) => s as unknown as SupabaseClient;

export function requireMaster(entity: string): MasterDefinition {
  const def = getMaster(entity);
  if (!def) throw new ApiError('NOT_FOUND', `Unknown master "${entity}".`);
  return def;
}

export const listQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  active: z.enum(['true', 'false', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z
    .string()
    .regex(/^-?[a-z_]+$/)
    .optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

/** Keeps search text safe inside PostgREST's or() filter syntax. */
function sanitizeSearch(q: string) {
  return q.replace(/[^\p{L}\p{N} .\-]/gu, '').trim();
}

export async function listMasters(
  supabase: ServerSupabase,
  def: MasterDefinition,
  q: ListQuery,
): Promise<{ rows: MasterRow[]; meta: PageMeta }> {
  let query = db(supabase).from(def.entity).select('*', { count: 'exact' });

  if (def.softDelete) query = query.is('deleted_at', null);
  if (q.active !== 'all') query = query.eq('active', q.active === 'true');

  const term = q.q ? sanitizeSearch(q.q) : '';
  if (term && def.searchColumns.length > 0) {
    query = query.or(def.searchColumns.map((c) => `${c}.ilike.*${term}*`).join(','));
  }

  const sortable = new Set(['id', 'sort_order', 'created_at', 'updated_at', ...def.fields.map((f) => f.key)]);
  const requested = q.sort?.replace(/^-/, '');
  const column = requested && sortable.has(requested) ? requested : def.defaultSort;
  const ascending = !(q.sort?.startsWith('-') && requested === column);

  const from = (q.page - 1) * q.pageSize;
  const { data, error, count } = await query
    .order(column, { ascending })
    .order('id', { ascending: true })
    .range(from, from + q.pageSize - 1);
  if (error) throw error;

  return {
    rows: (data ?? []) as MasterRow[],
    meta: { page: q.page, pageSize: q.pageSize, total: count ?? 0 },
  };
}

export async function getMasterRow(supabase: ServerSupabase, def: MasterDefinition, id: number): Promise<MasterRow> {
  let query = db(supabase).from(def.entity).select('*').eq('id', id);
  if (def.softDelete) query = query.is('deleted_at', null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError('NOT_FOUND', `${def.singular} not found.`);
  return data as MasterRow;
}

async function loadCustomFields(supabase: ServerSupabase, def: MasterDefinition): Promise<FieldDefinitionDto[]> {
  if (!def.supportsAttributes) return [];
  const { data, error } = await supabase
    .from('field_definitions')
    .select('*')
    .eq('entity', def.entity)
    .eq('active', true);
  if (error) throw error;
  return (data ?? []).map((f) => ({
    id: f.id,
    entity: f.entity,
    key: f.key,
    label: f.label,
    dataType: f.data_type as FieldDefinitionDto['dataType'],
    options: (f.options as string[] | null) ?? null,
    lookupEntity: f.lookup_entity,
    required: f.required,
    minValue: f.min_value === null ? null : Number(f.min_value),
    maxValue: f.max_value === null ? null : Number(f.max_value),
    pattern: f.pattern,
    helpText: f.help_text,
    showInList: f.show_in_list,
    showInForm: f.show_in_form,
    mobileVisible: f.mobile_visible,
    listOrder: f.list_order,
    formOrder: f.form_order,
  }));
}

/** Same schema the client form uses — the server re-validates everything. */
export async function parseMasterInput(
  supabase: ServerSupabase,
  def: MasterDefinition,
  body: unknown,
  mode: 'create' | 'update',
  id?: number,
): Promise<Record<string, unknown>> {
  const customFields = await loadCustomFields(supabase, def);
  const parsed = buildMasterSchema(def, customFields, mode).parse(body) as Record<string, unknown>;
  await checkBusinessRules(supabase, def, parsed, id);
  return parsed;
}

/** Rules that need other rows (the schema alone can't check them). */
async function checkBusinessRules(
  supabase: ServerSupabase,
  def: MasterDefinition,
  v: Record<string, unknown>,
  id?: number,
) {
  if (def.entity !== 'items') return;

  const { data: units, error } = await supabase
    .from('units')
    .select('id, symbol, unit_type_id, base_unit_id, conversion_factor');
  if (error) throw error;
  const index = indexUnits(
    (units ?? []).map((u) => ({
      id: u.id,
      symbol: u.symbol,
      unitTypeId: u.unit_type_id,
      baseUnitId: u.base_unit_id,
      conversionFactor: String(u.conversion_factor),
    })),
  );

  const pricing = Number(v.pricing_unit_id);
  const entry = Number(v.default_unit_id);
  if (!index.has(pricing)) throw fieldError('pricing_unit_id', 'Choose a valid unit.');
  if (!index.has(entry)) throw fieldError('default_unit_id', 'Choose a valid unit.');

  // Item-specific conversions can make e.g. box ↔ kg compatible
  let conversions: { fromUnitId: number; toUnitId: number; factor: string }[] = [];
  if (id) {
    const { data, error: convError } = await supabase
      .from('item_unit_conversions')
      .select('from_unit_id, to_unit_id, factor')
      .eq('item_id', id)
      .eq('active', true);
    if (convError) throw convError;
    conversions = (data ?? []).map((c) => ({ fromUnitId: c.from_unit_id, toUnitId: c.to_unit_id, factor: String(c.factor) }));
  }

  if (!isCompatible(entry, pricing, index, conversions)) {
    throw fieldError(
      'default_unit_id',
      `${index.get(entry)!.symbol} cannot be converted to ${index.get(pricing)!.symbol}. Pick a compatible unit or add an item conversion first.`,
    );
  }
}

function fieldError(path: string, message: string) {
  return new ApiError('VALIDATION_ERROR', 'Some fields are invalid.', { [path]: [message] });
}

export async function createMaster(supabase: ServerSupabase, def: MasterDefinition, body: unknown) {
  const values = await parseMasterInput(supabase, def, body, 'create');
  const { data, error } = await db(supabase).from(def.entity).insert(values).select('*').single();
  if (error) throw error;
  return data as MasterRow;
}

/** Optimistic concurrency: only updates when the client's version is still current. */
export async function updateMaster(supabase: ServerSupabase, def: MasterDefinition, id: number, body: unknown) {
  const { version, ...values } = await parseMasterInput(supabase, def, body, 'update', id);

  let query = db(supabase).from(def.entity).update(values).eq('id', id).eq('version', version as number);
  if (def.softDelete) query = query.is('deleted_at', null);
  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw error;
  if (data) return data as MasterRow;

  await getMasterRow(supabase, def, id); // throws NOT_FOUND if it's gone
  throw new ApiError('CONFLICT', 'Someone else changed this record. Reload it and try again.');
}

export async function deleteMaster(supabase: ServerSupabase, def: MasterDefinition, id: number) {
  if (def.softDelete) {
    // History (prices, calculations) keeps pointing at the row; it just disappears from masters.
    const { data, error } = await db(supabase)
      .from(def.entity)
      .update({ deleted_at: new Date().toISOString(), active: false })
      .eq('id', id)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError('NOT_FOUND', `${def.singular} not found.`);
    return { id, deleted: 'soft' as const };
  }

  const { data, error } = await db(supabase).from(def.entity).delete().eq('id', id).select('id').maybeSingle();
  if (error) {
    if (error.code === '23503') {
      throw new ApiError('CONFLICT', `This ${def.singular.toLowerCase()} is in use. Deactivate it instead of deleting.`);
    }
    throw error;
  }
  if (!data) throw new ApiError('NOT_FOUND', `${def.singular} not found.`);
  return { id, deleted: 'hard' as const };
}
