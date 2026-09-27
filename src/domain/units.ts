import Decimal from 'decimal.js';
import { DomainError } from './errors';

/** Unit master row, as the domain needs it. conversionFactor converts to the base unit. */
export interface UnitDef {
  id: number;
  symbol: string;
  unitTypeId: number;
  baseUnitId: number | null;
  conversionFactor: Decimal.Value;
}

/** Item-specific conversion: 1 fromUnit = factor toUnit (e.g. 1 box mango = 5 kg). */
export interface ItemConversion {
  fromUnitId: number;
  toUnitId: number;
  factor: Decimal.Value;
}

export type UnitIndex = ReadonlyMap<number, UnitDef>;

export function indexUnits(units: UnitDef[]): UnitIndex {
  return new Map(units.map((u) => [u.id, u]));
}

function getUnit(units: UnitIndex, id: number): UnitDef {
  const unit = units.get(id);
  if (!unit) throw new DomainError('VALIDATION_ERROR', `Unknown unit ${id}.`, 'unitId');
  return unit;
}

const baseOf = (u: UnitDef) => u.baseUnitId ?? u.id;
const toBase = (u: UnitDef) => new Decimal(u.conversionFactor);

/**
 * Factor f such that qty[from] * f = qty[to], or null when no path exists.
 * Tries the generic unit hierarchy first, then item-specific conversions (both directions),
 * which are also bridged through base units (1 box = 5 kg also gives 1 box = 5000 g).
 */
export function findConversionFactor(
  fromUnitId: number,
  toUnitId: number,
  units: UnitIndex,
  itemConversions: readonly ItemConversion[] = [],
): Decimal | null {
  if (fromUnitId === toUnitId) return new Decimal(1);

  const from = getUnit(units, fromUnitId);
  const to = getUnit(units, toUnitId);

  if (baseOf(from) === baseOf(to)) {
    return toBase(from).div(toBase(to));
  }

  for (const c of itemConversions) {
    const cFrom = getUnit(units, c.fromUnitId);
    const cTo = getUnit(units, c.toUnitId);
    const factor = new Decimal(c.factor);

    // from ~ c.from and to ~ c.to
    if (baseOf(cFrom) === baseOf(from) && baseOf(cTo) === baseOf(to)) {
      return toBase(from).div(toBase(cFrom)).mul(factor).mul(toBase(cTo)).div(toBase(to));
    }
    // reverse: from ~ c.to and to ~ c.from
    if (baseOf(cTo) === baseOf(from) && baseOf(cFrom) === baseOf(to)) {
      return toBase(from).div(toBase(cTo)).div(factor).mul(toBase(cFrom)).div(toBase(to));
    }
  }
  return null;
}

export function isCompatible(
  fromUnitId: number,
  toUnitId: number,
  units: UnitIndex,
  itemConversions: readonly ItemConversion[] = [],
): boolean {
  return findConversionFactor(fromUnitId, toUnitId, units, itemConversions) !== null;
}

/** Units a user may enter for an item priced in `priceUnitId`. */
export function compatibleUnits(
  priceUnitId: number,
  units: UnitIndex,
  itemConversions: readonly ItemConversion[] = [],
): UnitDef[] {
  return [...units.values()].filter((u) => isCompatible(u.id, priceUnitId, units, itemConversions));
}

/** Converts a quantity; throws INCOMPATIBLE_UNITS instead of guessing. */
export function convertQuantity(
  quantity: Decimal.Value,
  fromUnitId: number,
  toUnitId: number,
  units: UnitIndex,
  itemConversions: readonly ItemConversion[] = [],
): Decimal {
  const factor = findConversionFactor(fromUnitId, toUnitId, units, itemConversions);
  if (!factor) {
    const from = getUnit(units, fromUnitId);
    const to = getUnit(units, toUnitId);
    throw new DomainError(
      'INCOMPATIBLE_UNITS',
      `Cannot convert ${from.symbol} to ${to.symbol}.`,
      'unitId',
    );
  }
  return new Decimal(quantity).mul(factor);
}
