import 'server-only';
import { createHash } from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import { businessDate } from '@/domain/business-date';
import type { ServerSupabase } from '@/lib/supabase/server';
import type { BootstrapData, FieldDefinitionDto } from '@/shared/bootstrap';
import { parseSettings } from '@/shared/settings';

/**
 * Everything the client needs to render master-driven screens, in one round trip.
 * All queries run in parallel.
 */
export async function loadBootstrap(supabase: ServerSupabase, user: User): Promise<BootstrapData> {
  const [settings, categories, unitTypes, units, items, conversions, fields, permissions, profile] =
    await Promise.all([
      supabase.from('app_settings').select('key, value'),
      supabase.from('categories').select('id, name, parent_id, sort_order').eq('active', true).order('sort_order').order('name'),
      supabase.from('unit_types').select('id, key, name').eq('active', true).order('sort_order'),
      supabase
        .from('units')
        .select('id, name, symbol, unit_type_id, base_unit_id, conversion_factor, decimal_precision')
        .eq('active', true)
        .order('sort_order'),
      supabase
        .from('items')
        .select('id, name, category_id, pricing_unit_id, default_unit_id, attributes')
        .eq('active', true)
        .is('deleted_at', null)
        .order('sort_order')
        .order('name'),
      supabase.from('item_unit_conversions').select('item_id, from_unit_id, to_unit_id, factor').eq('active', true),
      supabase.from('field_definitions').select('*').eq('active', true).order('form_order'),
      supabase.rpc('my_permissions'),
      supabase.from('profiles').select('full_name').eq('user_id', user.id).maybeSingle(),
    ]);

  for (const r of [settings, categories, unitTypes, units, items, conversions, fields, permissions, profile]) {
    if (r.error) throw r.error;
  }

  const parsedSettings = parseSettings(settings.data ?? []);

  const conversionsByItem = new Map<number, BootstrapData['items'][number]['conversions']>();
  for (const c of conversions.data ?? []) {
    const list = conversionsByItem.get(c.item_id) ?? [];
    list.push({ fromUnitId: c.from_unit_id, toUnitId: c.to_unit_id, factor: String(c.factor) });
    conversionsByItem.set(c.item_id, list);
  }

  const payload: Omit<BootstrapData, 'version'> = {
    user: { id: user.id, email: user.email ?? null, fullName: profile.data?.full_name ?? null },
    permissions: ((permissions.data ?? []) as string[]).sort(),
    settings: parsedSettings,
    businessDate: businessDate(new Date(), parsedSettings.timezone),
    categories: (categories.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parent_id,
      sortOrder: c.sort_order,
    })),
    unitTypes: unitTypes.data ?? [],
    units: (units.data ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      symbol: u.symbol,
      unitTypeId: u.unit_type_id,
      baseUnitId: u.base_unit_id,
      conversionFactor: String(u.conversion_factor),
      decimalPrecision: u.decimal_precision,
    })),
    items: (items.data ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      categoryId: i.category_id,
      pricingUnitId: i.pricing_unit_id,
      defaultUnitId: i.default_unit_id,
      attributes: (i.attributes ?? {}) as Record<string, unknown>,
      conversions: conversionsByItem.get(i.id) ?? [],
    })),
    fieldDefinitions: (fields.data ?? []).map(
      (f): FieldDefinitionDto => ({
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
      }),
    ),
  };

  const version = createHash('sha1').update(JSON.stringify(payload)).digest('base64url').slice(0, 16);
  return { ...payload, version };
}
