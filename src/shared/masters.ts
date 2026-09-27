// Master registry: one entry per master table. The API, validation and the
// generic admin screens are all driven from this metadata — adding a master is
// a migration + an entry here, with no new UI code.

export type MasterFieldKind =
  | 'text'
  | 'integer'
  | 'number'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'select'
  | 'lookup'
  | 'string_list';

export type LookupEntity = 'categories' | 'unit_types' | 'units' | 'items';

/** Optional narrowing of lookup choices (resolved on the client from bootstrap data). */
export type LookupFilter = 'baseUnits';

export interface MasterField {
  /** Column name (snake_case) — also the form path and API error path */
  key: string;
  label: string;
  kind: MasterFieldKind;
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  /** decimal: value must be > 0 */
  positive?: boolean;
  pattern?: { regex: string; message: string };
  options?: readonly string[];
  lookup?: LookupEntity;
  lookupFilter?: LookupFilter;
  help?: string;
  /** Shown as a table column on desktop */
  list?: boolean;
  /** Shown on the mobile card under the title */
  mobile?: boolean;
  default?: unknown;
}

export interface MasterDefinition {
  entity: string;
  label: string;
  singular: string;
  /** Permission required for writes */
  permission: string;
  fields: MasterField[];
  searchColumns: string[];
  defaultSort: string;
  titleField: string;
  /** Rows carry an `attributes` jsonb validated against field_definitions */
  supportsAttributes?: boolean;
  /** DELETE sets deleted_at instead of removing the row (history references it) */
  softDelete?: boolean;
}

const COMMON_FIELDS: MasterField[] = [
  { key: 'sort_order', label: 'Sort order', kind: 'integer', min: 0, max: 1_000_000, default: 0 },
  { key: 'active', label: 'Active', kind: 'boolean', default: true, list: true },
];

const KEY_PATTERN = { regex: '^[a-z][a-z0-9_]*$', message: 'Use lowercase letters, digits and _ (start with a letter).' };

export const FIELD_DATA_TYPES = ['text', 'number', 'decimal', 'boolean', 'date', 'select', 'lookup'] as const;
export const LOOKUP_ENTITIES: readonly LookupEntity[] = ['categories', 'unit_types', 'units', 'items'];
/** Entities whose rows have an `attributes` column for custom fields */
export const ATTRIBUTE_ENTITIES = ['items'] as const;

export const MASTERS: Record<string, MasterDefinition> = {
  categories: {
    entity: 'categories',
    label: 'Categories',
    singular: 'Category',
    permission: 'masters.categories.write',
    searchColumns: ['name'],
    defaultSort: 'sort_order',
    titleField: 'name',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true, maxLength: 60 },
      { key: 'parent_id', label: 'Parent category', kind: 'lookup', lookup: 'categories', list: true, mobile: true },
      ...COMMON_FIELDS,
    ],
  },

  unit_types: {
    entity: 'unit_types',
    label: 'Unit types',
    singular: 'Unit type',
    permission: 'masters.unit_types.write',
    searchColumns: ['name', 'key'],
    defaultSort: 'sort_order',
    titleField: 'name',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true, maxLength: 40 },
      { key: 'key', label: 'Key', kind: 'text', required: true, maxLength: 30, pattern: KEY_PATTERN, list: true, mobile: true },
      ...COMMON_FIELDS,
    ],
  },

  units: {
    entity: 'units',
    label: 'Units',
    singular: 'Unit',
    permission: 'masters.units.write',
    searchColumns: ['name', 'symbol'],
    defaultSort: 'sort_order',
    titleField: 'name',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true, maxLength: 40 },
      { key: 'symbol', label: 'Symbol', kind: 'text', required: true, maxLength: 12, list: true, mobile: true },
      { key: 'unit_type_id', label: 'Unit type', kind: 'lookup', lookup: 'unit_types', required: true, list: true, mobile: true },
      {
        key: 'base_unit_id',
        label: 'Base unit',
        kind: 'lookup',
        lookup: 'units',
        lookupFilter: 'baseUnits',
        list: true,
        help: 'Leave empty if this is a base unit (e.g. kg). Set it for derived units (g → kg).',
      },
      {
        key: 'conversion_factor',
        label: 'Conversion factor',
        kind: 'decimal',
        required: true,
        positive: true,
        default: '1',
        list: true,
        help: 'How many base units one of this unit is (g → 0.001). Must be 1 for a base unit.',
      },
      { key: 'decimal_precision', label: 'Quantity decimals', kind: 'integer', required: true, min: 0, max: 6, default: 2 },
      ...COMMON_FIELDS,
    ],
  },

  items: {
    entity: 'items',
    label: 'Items',
    singular: 'Item',
    permission: 'masters.items.write',
    searchColumns: ['name'],
    defaultSort: 'sort_order',
    titleField: 'name',
    supportsAttributes: true,
    softDelete: true,
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true, maxLength: 80 },
      { key: 'category_id', label: 'Category', kind: 'lookup', lookup: 'categories', required: true, list: true, mobile: true },
      {
        key: 'pricing_unit_id',
        label: 'Pricing unit',
        kind: 'lookup',
        lookup: 'units',
        required: true,
        list: true,
        mobile: true,
        help: 'Daily prices are entered per this unit (₹/kg).',
      },
      {
        key: 'default_unit_id',
        label: 'Default entry unit',
        kind: 'lookup',
        lookup: 'units',
        required: true,
        list: true,
        help: 'Unit pre-selected when adding this item to a calculation. Must convert to the pricing unit.',
      },
      ...COMMON_FIELDS,
    ],
  },

  item_unit_conversions: {
    entity: 'item_unit_conversions',
    label: 'Item conversions',
    singular: 'Item conversion',
    permission: 'masters.item_unit_conversions.write',
    searchColumns: [],
    defaultSort: 'item_id',
    titleField: 'item_id',
    fields: [
      { key: 'item_id', label: 'Item', kind: 'lookup', lookup: 'items', required: true, list: true },
      { key: 'from_unit_id', label: 'From unit', kind: 'lookup', lookup: 'units', required: true, list: true, mobile: true },
      { key: 'to_unit_id', label: 'To unit', kind: 'lookup', lookup: 'units', required: true, list: true, mobile: true },
      {
        key: 'factor',
        label: 'Factor',
        kind: 'decimal',
        required: true,
        positive: true,
        list: true,
        mobile: true,
        help: '1 "from" unit = factor × "to" unit. Example: 1 box of mango = 5 kg.',
      },
      ...COMMON_FIELDS,
    ],
  },

  field_definitions: {
    entity: 'field_definitions',
    label: 'Custom fields',
    singular: 'Custom field',
    permission: 'masters.field_definitions.write',
    searchColumns: ['label', 'key'],
    defaultSort: 'form_order',
    titleField: 'label',
    fields: [
      { key: 'entity', label: 'Applies to', kind: 'select', options: ATTRIBUTE_ENTITIES, required: true, default: 'items', list: true, mobile: true },
      { key: 'label', label: 'Label', kind: 'text', required: true, maxLength: 60 },
      { key: 'key', label: 'Key', kind: 'text', required: true, maxLength: 40, pattern: KEY_PATTERN, list: true },
      { key: 'data_type', label: 'Type', kind: 'select', options: FIELD_DATA_TYPES, required: true, default: 'text', list: true, mobile: true },
      { key: 'options', label: 'Choices', kind: 'string_list', help: 'For "select": one choice per line.' },
      { key: 'lookup_entity', label: 'Lookup source', kind: 'select', options: LOOKUP_ENTITIES, help: 'For "lookup" fields.' },
      { key: 'required', label: 'Required', kind: 'boolean', default: false, list: true },
      { key: 'min_value', label: 'Minimum', kind: 'decimal' },
      { key: 'max_value', label: 'Maximum', kind: 'decimal' },
      { key: 'pattern', label: 'Pattern (regex)', kind: 'text', maxLength: 200 },
      { key: 'help_text', label: 'Help text', kind: 'text', maxLength: 200 },
      { key: 'show_in_form', label: 'Show in form', kind: 'boolean', default: true },
      { key: 'show_in_list', label: 'Show in list (desktop)', kind: 'boolean', default: true },
      { key: 'mobile_visible', label: 'Show on mobile card', kind: 'boolean', default: false },
      { key: 'form_order', label: 'Form order', kind: 'integer', min: 0, max: 10_000, default: 0 },
      { key: 'list_order', label: 'List order', kind: 'integer', min: 0, max: 10_000, default: 0 },
      ...COMMON_FIELDS,
    ],
  },
};

export function getMaster(entity: string): MasterDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(MASTERS, entity) ? MASTERS[entity] : undefined;
}

export type MasterRow = Record<string, unknown> & { id: number; version: number };
