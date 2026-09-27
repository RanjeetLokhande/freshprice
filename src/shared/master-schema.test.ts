import { describe, expect, it } from 'vitest';
import type { FieldDefinitionDto } from './bootstrap';
import { buildMasterSchema, masterFormDefaults } from './master-schema';
import { MASTERS } from './masters';

const origin: FieldDefinitionDto = {
  id: 1,
  entity: 'items',
  key: 'origin',
  label: 'Origin',
  dataType: 'select',
  options: ['Local', 'Imported'],
  lookupEntity: null,
  required: true,
  minValue: null,
  maxValue: null,
  pattern: null,
  helpText: null,
  showInList: true,
  showInForm: true,
  mobileVisible: false,
  listOrder: 1,
  formOrder: 1,
};

const paths = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  (r.error?.issues ?? []).map((i) => i.path.join('.'));

describe('buildMasterSchema', () => {
  const item = { name: ' Potato ', category_id: 1, pricing_unit_id: 1, default_unit_id: 1, sort_order: 0, active: true };

  it('validates and trims registry fields', () => {
    const r = buildMasterSchema(MASTERS.items).safeParse(item);
    expect(r.success).toBe(true);
    expect((r.data as Record<string, unknown>).name).toBe('Potato');
  });

  it('reports required fields with their paths', () => {
    const r = buildMasterSchema(MASTERS.items).safeParse({ ...item, name: '', category_id: null });
    expect(paths(r)).toEqual(expect.arrayContaining(['name', 'category_id']));
  });

  it('validates custom attributes from field definitions', () => {
    const schema = buildMasterSchema(MASTERS.items, [origin]);
    expect(paths(schema.safeParse({ ...item, attributes: {} }))).toContain('attributes.origin');
    expect(paths(schema.safeParse({ ...item, attributes: { origin: 'Mars' } }))).toContain('attributes.origin');
    const ok = schema.safeParse({ ...item, attributes: { origin: 'Local', legacy: 1 } });
    expect(ok.success).toBe(true);
    // Values of fields not shown in the form are preserved
    expect((ok.data as { attributes: Record<string, unknown> }).attributes).toEqual({ origin: 'Local', legacy: 1 });
  });

  it('strips unknown top-level keys (id, created_at can never be written)', () => {
    const r = buildMasterSchema(MASTERS.items).safeParse({ ...item, id: 99, created_at: 'x' });
    expect(r.data).not.toHaveProperty('id');
    expect(r.data).not.toHaveProperty('created_at');
  });

  it('requires version on update', () => {
    expect(paths(buildMasterSchema(MASTERS.items, [], 'update').safeParse(item))).toContain('version');
    expect(buildMasterSchema(MASTERS.items, [], 'update').safeParse({ ...item, version: 3 }).success).toBe(true);
  });

  it('enforces unit rules: base unit factor = 1, factor > 0', () => {
    const unit = { name: 'Gram', symbol: 'g', unit_type_id: 1, base_unit_id: null, conversion_factor: '0.001', decimal_precision: 0, sort_order: 0, active: true };
    expect(paths(buildMasterSchema(MASTERS.units).safeParse(unit))).toContain('conversion_factor');
    expect(buildMasterSchema(MASTERS.units).safeParse({ ...unit, base_unit_id: 1 }).success).toBe(true);
    expect(paths(buildMasterSchema(MASTERS.units).safeParse({ ...unit, base_unit_id: 1, conversion_factor: '0' }))).toContain(
      'conversion_factor',
    );
    expect(paths(buildMasterSchema(MASTERS.units).safeParse({ ...unit, base_unit_id: 1, conversion_factor: 'abc' }))).toContain(
      'conversion_factor',
    );
  });

  it('checks custom-field definitions: select needs choices, keys are snake_case', () => {
    const fd = {
      entity: 'items', label: 'Grade', key: 'grade', data_type: 'select', options: '', lookup_entity: null,
      required: false, min_value: null, max_value: null, pattern: null, help_text: null,
      show_in_form: true, show_in_list: true, mobile_visible: false, form_order: 0, list_order: 0, sort_order: 0, active: true,
    };
    const schema = buildMasterSchema(MASTERS.field_definitions);
    expect(paths(schema.safeParse(fd))).toContain('options');
    const ok = schema.safeParse({ ...fd, options: 'A\nB\n\nC' });
    expect(ok.success).toBe(true);
    expect((ok.data as { options: string[] }).options).toEqual(['A', 'B', 'C']);
    expect(paths(schema.safeParse({ ...fd, options: 'A', key: 'Bad Key' }))).toContain('key');
  });

  it('rejects the same from/to unit in item conversions', () => {
    const r = buildMasterSchema(MASTERS.item_unit_conversions).safeParse({
      item_id: 1, from_unit_id: 2, to_unit_id: 2, factor: '5', sort_order: 0, active: true,
    });
    expect(paths(r)).toContain('to_unit_id');
  });
});

describe('masterFormDefaults', () => {
  it('uses registry defaults for a new row and row values when editing', () => {
    expect(masterFormDefaults(MASTERS.units, []).conversion_factor).toBe('1');
    const edit = masterFormDefaults(MASTERS.field_definitions, [], {
      id: 1, version: 4, options: ['A', 'B'], data_type: 'select',
    } as never);
    expect(edit.options).toBe('A\nB');
    expect(edit.version).toBe(4);
  });
});
