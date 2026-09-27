import { z } from 'zod';
import { isIsoDate } from '@/domain/business-date';
import type { FieldDefinitionDto } from './bootstrap';
import type { MasterDefinition, MasterField, MasterRow } from './masters';

// Builds ONE Zod schema per master from registry metadata + custom field
// definitions. The client form (zodResolver) and the API use the same schema.

const isEmpty = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (typeof v === 'number' && Number.isNaN(v));

const DECIMAL = /^-?\d+(\.\d+)?$/;

function safeRegex(source: string): RegExp | null {
  try {
    return new RegExp(source);
  } catch {
    return null;
  }
}

function baseSchema(f: MasterField): z.ZodType {
  switch (f.kind) {
    case 'text': {
      let s = z.string().trim().max(f.maxLength ?? 200, `At most ${f.maxLength ?? 200} characters.`);
      const re = f.pattern && safeRegex(f.pattern.regex);
      if (re) s = s.regex(re, f.pattern!.message);
      return s;
    }
    case 'integer': {
      let s = z.number({ error: 'Enter a whole number.' }).int('Enter a whole number.');
      if (f.min !== undefined) s = s.min(f.min, `Must be at least ${f.min}.`);
      if (f.max !== undefined) s = s.max(f.max, `Must be at most ${f.max}.`);
      return s;
    }
    case 'number': {
      let s = z.number({ error: 'Enter a number.' });
      if (f.min !== undefined) s = s.min(f.min, `Must be at least ${f.min}.`);
      if (f.max !== undefined) s = s.max(f.max, `Must be at most ${f.max}.`);
      return s;
    }
    case 'decimal':
      return z
        .union([z.string(), z.number()], { error: 'Enter a number.' })
        .transform((v) => String(v).trim())
        .pipe(
          z
            .string()
            .regex(DECIMAL, 'Enter a valid number.')
            .refine((v) => !f.positive || Number(v) > 0, 'Must be greater than 0.')
            .refine((v) => f.min === undefined || Number(v) >= f.min, `Must be at least ${f.min}.`)
            .refine((v) => f.max === undefined || Number(v) <= f.max, `Must be at most ${f.max}.`),
        );
    case 'boolean':
      return z.boolean({ error: 'Choose yes or no.' });
    case 'date':
      return z.string().refine(isIsoDate, 'Enter a valid date.');
    case 'select': {
      const options = (f.options ?? []) as readonly string[];
      return options.length > 0
        ? z.enum(options as [string, ...string[]], { error: 'Choose one of the options.' })
        : z.string();
    }
    case 'lookup':
      return z.number({ error: `Choose a ${f.label.toLowerCase()}.` }).int().positive(`Choose a ${f.label.toLowerCase()}.`);
    case 'string_list':
      return z.preprocess(
        (v) =>
          typeof v === 'string'
            ? v
                .split(/\r?\n|,/)
                .map((s) => s.trim())
                .filter(Boolean)
            : v,
        z.array(z.string().trim().min(1).max(60, 'Each choice: at most 60 characters.')).max(50, 'At most 50 choices.'),
      );
  }
}

export function fieldSchema(f: MasterField): z.ZodType {
  if (f.kind === 'boolean') return baseSchema(f);
  const inner = baseSchema(f).nullable();
  return z.preprocess(
    (v) => (isEmpty(v) || (Array.isArray(v) && v.length === 0) ? null : v),
    f.required ? inner.refine((v) => v !== null, `${f.label} is required.`) : inner,
  );
}

/** Custom field definition → the same field shape the registry uses. */
export function customFieldToMasterField(d: FieldDefinitionDto): MasterField {
  return {
    key: d.key,
    label: d.label,
    kind: d.dataType === 'number' ? 'number' : d.dataType,
    required: d.required,
    min: d.minValue ?? undefined,
    max: d.maxValue ?? undefined,
    options: d.options ?? undefined,
    lookup: (d.lookupEntity as MasterField['lookup']) ?? undefined,
    pattern: d.pattern ? { regex: d.pattern, message: `Must match the pattern ${d.pattern}.` } : undefined,
    help: d.helpText ?? undefined,
    list: d.showInList,
    mobile: d.mobileVisible,
  };
}

export function formCustomFields(def: MasterDefinition, defs: readonly FieldDefinitionDto[]): FieldDefinitionDto[] {
  if (!def.supportsAttributes) return [];
  return defs
    .filter((d) => d.entity === def.entity && d.showInForm)
    .sort((a, b) => a.formOrder - b.formOrder);
}

type EntityRefiner = (v: Record<string, unknown>, ctx: z.RefinementCtx) => void;

const REFINERS: Record<string, EntityRefiner> = {
  units: (v, ctx) => {
    if (v.base_unit_id == null && v.conversion_factor != null && Number(v.conversion_factor) !== 1) {
      ctx.addIssue({ code: 'custom', path: ['conversion_factor'], message: 'A base unit must have factor 1.' });
    }
  },
  item_unit_conversions: (v, ctx) => {
    if (v.from_unit_id != null && v.from_unit_id === v.to_unit_id) {
      ctx.addIssue({ code: 'custom', path: ['to_unit_id'], message: 'Choose a different unit.' });
    }
  },
  field_definitions: (v, ctx) => {
    if (v.data_type === 'select' && !(Array.isArray(v.options) && v.options.length > 0)) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Add at least one choice.' });
    }
    if (v.data_type === 'lookup' && !v.lookup_entity) {
      ctx.addIssue({ code: 'custom', path: ['lookup_entity'], message: 'Choose a lookup source.' });
    }
    if (v.min_value != null && v.max_value != null && Number(v.min_value) > Number(v.max_value)) {
      ctx.addIssue({ code: 'custom', path: ['max_value'], message: 'Maximum must be ≥ minimum.' });
    }
  },
};

export type MasterSchemaMode = 'create' | 'update';

export function buildMasterSchema(
  def: MasterDefinition,
  customFields: readonly FieldDefinitionDto[] = [],
  mode: MasterSchemaMode = 'create',
) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of def.fields) shape[f.key] = fieldSchema(f);

  if (def.supportsAttributes) {
    const attrShape: Record<string, z.ZodType> = {};
    for (const d of formCustomFields(def, customFields)) attrShape[d.key] = fieldSchema(customFieldToMasterField(d));
    // loose: values of fields hidden from the form are kept, not dropped
    shape.attributes = z.looseObject(attrShape).default({});
  }
  if (mode === 'update') shape.version = z.number({ error: 'Missing version.' }).int().positive();

  const refiner = REFINERS[def.entity];
  const schema = z.object(shape);
  return refiner ? schema.superRefine(refiner) : schema;
}

/** Initial form values: row values, else registry defaults. */
export function masterFormDefaults(
  def: MasterDefinition,
  customFields: readonly FieldDefinitionDto[],
  row?: MasterRow | null,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = row ? row[f.key] : f.default;
    values[f.key] =
      v === undefined || v === null
        ? f.kind === 'boolean'
          ? false
          : f.kind === 'string_list'
            ? ''
            : ''
        : f.kind === 'decimal'
          ? String(v)
          : f.kind === 'string_list' && Array.isArray(v)
            ? v.join('\n')
            : v;
  }
  if (def.supportsAttributes) {
    const attrs = ((row?.attributes as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = { ...attrs };
    for (const d of formCustomFields(def, customFields)) {
      const v = attrs[d.key];
      out[d.key] = v === undefined || v === null ? (d.dataType === 'boolean' ? false : '') : d.dataType === 'decimal' ? String(v) : v;
    }
    values.attributes = out;
  }
  if (row) values.version = row.version;
  return values;
}
