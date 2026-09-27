// Validation for app_settings values: by data_type, plus key-specific rules.

export interface SettingDto {
  key: string;
  value: unknown;
  dataType: 'text' | 'number' | 'boolean' | 'select' | 'json';
  label: string;
  description: string | null;
  options: string[] | null;
  sortOrder: number;
  version: number;
}

function validTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function validLocale(locale: string) {
  try {
    return Intl.NumberFormat.supportedLocalesOf([locale]).length > 0;
  } catch {
    return false;
  }
}

const KEY_RULES: Record<string, (v: unknown) => string | null> = {
  'business.timezone': (v) => (validTimeZone(String(v)) ? null : 'Unknown timezone. Example: Asia/Kolkata.'),
  'currency.code': (v) => (/^[A-Z]{3}$/.test(String(v)) ? null : 'Use a 3-letter ISO code, e.g. INR.'),
  'currency.locale': (v) => (validLocale(String(v)) ? null : 'Unknown locale. Example: en-IN.'),
  'currency.symbol': (v) => (String(v).length <= 4 ? null : 'At most 4 characters.'),
  'money.scale': (v) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4 ? null : 'Whole number from 0 to 4.'),
  'calculation.reference_padding': (v) =>
    Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 12 ? null : 'Whole number from 1 to 12.',
  'calculation.reference_prefix': (v) => (/^[A-Za-z0-9\-_/]{0,10}$/.test(String(v)) ? null : 'Up to 10 letters, digits, - _ /.'),
};

/** Returns an error message, or null when the value is acceptable. */
export function validateSetting(setting: Pick<SettingDto, 'key' | 'dataType' | 'options'>, value: unknown): string | null {
  switch (setting.dataType) {
    case 'text':
      if (typeof value !== 'string' || value.trim() === '') return 'Enter a value.';
      if (value.length > 100) return 'At most 100 characters.';
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'Enter a number.';
      break;
    case 'boolean':
      if (typeof value !== 'boolean') return 'Choose yes or no.';
      break;
    case 'select':
      if (typeof value !== 'string' || !(setting.options ?? []).includes(value)) return 'Choose one of the options.';
      break;
    case 'json':
      break;
  }
  return KEY_RULES[setting.key]?.(value) ?? null;
}
