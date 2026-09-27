import Decimal from 'decimal.js';

export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'DOWN' | 'UP';

/** The single money policy; values come from app_settings. */
export interface MoneyPolicy {
  scale: number;
  roundingMode: RoundingMode;
}

export const DEFAULT_MONEY_POLICY: MoneyPolicy = { scale: 2, roundingMode: 'HALF_UP' };

const DECIMAL_ROUNDING: Record<RoundingMode, Decimal.Rounding> = {
  HALF_UP: Decimal.ROUND_HALF_UP,
  HALF_EVEN: Decimal.ROUND_HALF_EVEN,
  DOWN: Decimal.ROUND_DOWN,
  UP: Decimal.ROUND_UP,
};

export type DecimalInput = Decimal.Value;

export function dec(value: DecimalInput): Decimal {
  return new Decimal(value);
}

/** Rounds to the policy scale. Call only at the financial boundary (line amount). */
export function roundMoney(value: DecimalInput, policy: MoneyPolicy = DEFAULT_MONEY_POLICY): Decimal {
  return dec(value).toDecimalPlaces(policy.scale, DECIMAL_ROUNDING[policy.roundingMode]);
}

/** Fixed-point string for transport/storage, e.g. "1230.00". */
export function toMoneyString(value: DecimalInput, policy: MoneyPolicy = DEFAULT_MONEY_POLICY): string {
  return roundMoney(value, policy).toFixed(policy.scale);
}

export function formatMoney(
  value: DecimalInput,
  opts: { locale?: string; currency?: string; scale?: number } = {},
): string {
  const { locale = 'en-IN', currency = 'INR', scale = 2 } = opts;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(dec(value).toNumber());
}
