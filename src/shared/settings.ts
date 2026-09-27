import type { MoneyPolicy, RoundingMode } from '@/domain/money';
import { DEFAULT_TIMEZONE } from '@/domain/business-date';

/** Typed view of app_settings rows. Defaults apply only if a row is missing. */
export interface AppSettings {
  timezone: string;
  currencyCode: string;
  currencySymbol: string;
  locale: string;
  money: MoneyPolicy;
  duplicateLinePolicy: 'merge' | 'allow';
  referencePrefix: string;
  referencePadding: number;
  allowCopyPreviousPrice: boolean;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export function parseSettings(rows: readonly SettingRow[]): AppSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const str = (k: string, d: string) => (typeof map.get(k) === 'string' ? (map.get(k) as string) : d);
  const num = (k: string, d: number) => (typeof map.get(k) === 'number' ? (map.get(k) as number) : d);
  const bool = (k: string, d: boolean) => (typeof map.get(k) === 'boolean' ? (map.get(k) as boolean) : d);

  return {
    timezone: str('business.timezone', DEFAULT_TIMEZONE),
    currencyCode: str('currency.code', 'INR'),
    currencySymbol: str('currency.symbol', '₹'),
    locale: str('currency.locale', 'en-IN'),
    money: {
      scale: num('money.scale', 2),
      roundingMode: str('money.rounding_mode', 'HALF_UP') as RoundingMode,
    },
    duplicateLinePolicy: str('calculation.duplicate_line_policy', 'merge') === 'allow' ? 'allow' : 'merge',
    referencePrefix: str('calculation.reference_prefix', 'CAL-'),
    referencePadding: num('calculation.reference_padding', 6),
    allowCopyPreviousPrice: bool('prices.allow_copy_previous', true),
  };
}
