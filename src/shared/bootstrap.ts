import type { AppSettings } from './settings';

export interface CategoryDto {
  id: number;
  name: string;
  parentId: number | null;
  sortOrder: number;
}

export interface UnitTypeDto {
  id: number;
  key: string;
  name: string;
}

export interface UnitDto {
  id: number;
  name: string;
  symbol: string;
  unitTypeId: number;
  baseUnitId: number | null;
  conversionFactor: string;
  decimalPrecision: number;
}

export interface ItemConversionDto {
  fromUnitId: number;
  toUnitId: number;
  factor: string;
}

export interface ItemDto {
  id: number;
  name: string;
  categoryId: number;
  pricingUnitId: number;
  defaultUnitId: number;
  attributes: Record<string, unknown>;
  conversions: ItemConversionDto[];
}

export interface FieldDefinitionDto {
  id: number;
  entity: string;
  key: string;
  label: string;
  dataType: 'text' | 'number' | 'decimal' | 'boolean' | 'date' | 'select' | 'lookup';
  options: string[] | null;
  lookupEntity: string | null;
  required: boolean;
  minValue: number | null;
  maxValue: number | null;
  pattern: string | null;
  helpText: string | null;
  showInList: boolean;
  showInForm: boolean;
  mobileVisible: boolean;
  listOrder: number;
  formOrder: number;
}

export interface BootstrapData {
  user: { id: string; email: string | null; fullName: string | null };
  permissions: string[];
  settings: AppSettings;
  businessDate: string;
  categories: CategoryDto[];
  unitTypes: UnitTypeDto[];
  units: UnitDto[];
  items: ItemDto[];
  fieldDefinitions: FieldDefinitionDto[];
  version: string;
}
