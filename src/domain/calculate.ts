import Decimal from 'decimal.js';
import { DomainError } from './errors';
import { DEFAULT_MONEY_POLICY, type MoneyPolicy, roundMoney } from './money';
import { convertQuantity, type ItemConversion, type UnitIndex } from './units';

/** Normalized quantities are stored as numeric(18,6). */
export const NORMALIZED_QTY_SCALE = 6;

export interface LineInput {
  quantity: Decimal.Value;
  unitId: number;
  /** null/undefined = no price for the date; never treated as zero */
  price: Decimal.Value | null | undefined;
  priceUnitId: number;
  itemConversions?: readonly ItemConversion[];
}

export interface LineResult {
  quantity: string;
  unitId: number;
  normalizedQuantity: string;
  price: string;
  priceUnitId: number;
  amount: string;
}

/**
 * The only line-amount calculation in the system (client preview, server save,
 * reports and exports all call this).
 *   1. validate quantity and price
 *   2. convert quantity into the price unit (throws on incompatible units)
 *   3. amount = normalized quantity × price, rounded once per money policy
 */
export function calculateLine(
  input: LineInput,
  units: UnitIndex,
  policy: MoneyPolicy = DEFAULT_MONEY_POLICY,
): LineResult {
  let quantity: Decimal;
  try {
    quantity = new Decimal(input.quantity);
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Quantity must be a number.', 'quantity');
  }
  if (!quantity.isFinite() || quantity.lte(0)) {
    throw new DomainError('VALIDATION_ERROR', 'Quantity must be greater than zero.', 'quantity');
  }

  if (input.price === null || input.price === undefined || input.price === '') {
    throw new DomainError('PRICE_MISSING', 'Price not available.', 'price');
  }
  const price = new Decimal(input.price);
  if (!price.isFinite() || price.lt(0)) {
    throw new DomainError('VALIDATION_ERROR', 'Price must be zero or more.', 'price');
  }

  const normalized = convertQuantity(
    quantity,
    input.unitId,
    input.priceUnitId,
    units,
    input.itemConversions,
  );
  const amount = roundMoney(normalized.mul(price), policy);

  return {
    quantity: quantity.toString(),
    unitId: input.unitId,
    normalizedQuantity: normalized.toDecimalPlaces(NORMALIZED_QTY_SCALE).toString(),
    price: price.toFixed(policy.scale),
    priceUnitId: input.priceUnitId,
    amount: amount.toFixed(policy.scale),
  };
}

export interface Totals {
  subtotal: string;
  adjustment: string;
  grandTotal: string;
}

export function calculateTotals(
  amounts: readonly Decimal.Value[],
  adjustment: Decimal.Value = 0,
  policy: MoneyPolicy = DEFAULT_MONEY_POLICY,
): Totals {
  const subtotal = amounts.reduce<Decimal>((sum, a) => sum.plus(a), new Decimal(0));
  const adj = roundMoney(adjustment, policy);
  return {
    subtotal: subtotal.toFixed(policy.scale),
    adjustment: adj.toFixed(policy.scale),
    grandTotal: subtotal.plus(adj).toFixed(policy.scale),
  };
}
