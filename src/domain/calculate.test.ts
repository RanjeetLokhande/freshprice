import { describe, expect, it } from 'vitest';
import { calculateLine, calculateTotals } from './calculate';
import { DomainError } from './errors';
import { indexUnits, compatibleUnits, type UnitDef } from './units';
import { businessDate, addDays, isIsoDate } from './business-date';

// Mirrors the seed data
const KG = 1, L = 2, PC = 3, BOX = 4, G = 7, ML = 8, DOZEN = 9;
const units = indexUnits([
  { id: KG, symbol: 'kg', unitTypeId: 1, baseUnitId: null, conversionFactor: 1 },
  { id: L, symbol: 'L', unitTypeId: 2, baseUnitId: null, conversionFactor: 1 },
  { id: PC, symbol: 'pc', unitTypeId: 3, baseUnitId: null, conversionFactor: 1 },
  { id: BOX, symbol: 'box', unitTypeId: 4, baseUnitId: null, conversionFactor: 1 },
  { id: G, symbol: 'g', unitTypeId: 1, baseUnitId: KG, conversionFactor: '0.001' },
  { id: ML, symbol: 'ml', unitTypeId: 2, baseUnitId: L, conversionFactor: '0.001' },
  { id: DOZEN, symbol: 'dozen', unitTypeId: 3, baseUnitId: PC, conversionFactor: 12 },
] satisfies UnitDef[]);

const line = (quantity: string | number, unitId: number, price: string | number | null, priceUnitId: number) =>
  calculateLine({ quantity, unitId, price, priceUnitId }, units);

function expectDomainError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`expected DomainError ${code}`);
}

describe('calculateLine', () => {
  it('500 g @ ₹30/kg = ₹15', () => {
    const r = line(500, G, 30, KG);
    expect(r.normalizedQuantity).toBe('0.5');
    expect(r.amount).toBe('15.00');
    expect(r.price).toBe('30.00');
  });

  it('matches the spec example: 1 + 10 + 10 kg = ₹1,230', () => {
    const amounts = [line(1, KG, 30, KG), line(10, KG, 80, KG), line(10, KG, 40, KG)].map((l) => l.amount);
    expect(amounts).toEqual(['30.00', '800.00', '400.00']);
    expect(calculateTotals(amounts).grandTotal).toBe('1230.00');
  });

  it('converts 10 g, 2 kg, ml and litre', () => {
    expect(line(10, G, 80, KG).amount).toBe('0.80');
    expect(line(2, KG, 30, KG).amount).toBe('60.00');
    expect(line(500, ML, 60, L).amount).toBe('30.00');
    expect(line(10, ML, 60, L).amount).toBe('0.60');
  });

  it('converts kg to a gram price', () => {
    expect(line('1.5', KG, '0.05', G).amount).toBe('75.00');
  });

  it('handles pieces vs dozen without float drift', () => {
    expect(line(3, PC, 60, DOZEN).amount).toBe('15.00');
    expect(line(2, DOZEN, 5, PC).amount).toBe('120.00');
  });

  it('rejects incompatible units instead of calculating', () => {
    expectDomainError(() => line(500, ML, 30, KG), 'INCOMPATIBLE_UNITS');
    expectDomainError(() => line(1, BOX, 30, KG), 'INCOMPATIBLE_UNITS');
  });

  it('uses item-specific conversions (1 box mango = 5 kg), both directions and via base units', () => {
    const itemConversions = [{ fromUnitId: BOX, toUnitId: KG, factor: 5 }];
    const box = calculateLine({ quantity: 2, unitId: BOX, price: 100, priceUnitId: KG, itemConversions }, units);
    expect(box.normalizedQuantity).toBe('10');
    expect(box.amount).toBe('1000.00');

    const grams = calculateLine({ quantity: 2500, unitId: G, price: 400, priceUnitId: BOX, itemConversions }, units);
    expect(grams.normalizedQuantity).toBe('0.5');
    expect(grams.amount).toBe('200.00');
  });

  it('treats a missing price as an error, never zero', () => {
    expectDomainError(() => line(1, KG, null, KG), 'PRICE_MISSING');
  });

  it('allows a zero price when explicitly set', () => {
    expect(line(1, KG, 0, KG).amount).toBe('0.00');
  });

  it('validates quantity', () => {
    expectDomainError(() => line(0, KG, 30, KG), 'VALIDATION_ERROR');
    expectDomainError(() => line(-1, KG, 30, KG), 'VALIDATION_ERROR');
    expectDomainError(() => line('abc', KG, 30, KG), 'VALIDATION_ERROR');
  });

  it('rounds once at the amount (HALF_UP default, HALF_EVEN configurable)', () => {
    // 0.125 kg × 0.1 = 0.0125 → 0.01 ; 1 × 0.005 → 0.01 (HALF_UP)
    expect(line(1, KG, '0.005', KG).amount).toBe('0.01');
    expect(line(333, G, 10, KG).amount).toBe('3.33');
    expect(line(335, G, 10, KG).amount).toBe('3.35');
    const halfEven = calculateLine(
      { quantity: '0.25', unitId: KG, price: '0.1', priceUnitId: KG },
      units,
      { scale: 2, roundingMode: 'HALF_EVEN' },
    );
    expect(halfEven.amount).toBe('0.02'); // 0.025 → 0.02
  });
});

describe('compatibleUnits', () => {
  it('lists only units that convert to the price unit', () => {
    expect(compatibleUnits(KG, units).map((u) => u.symbol).sort()).toEqual(['g', 'kg']);
    const withBox = compatibleUnits(KG, units, [{ fromUnitId: BOX, toUnitId: KG, factor: 5 }]);
    expect(withBox.map((u) => u.symbol).sort()).toEqual(['box', 'g', 'kg']);
  });
});

describe('calculateTotals', () => {
  it('applies adjustment to the subtotal', () => {
    expect(calculateTotals(['30.00', '800.00'], '-30')).toEqual({
      subtotal: '830.00',
      adjustment: '-30.00',
      grandTotal: '800.00',
    });
  });
});

describe('business date', () => {
  it('uses Asia/Kolkata, not UTC', () => {
    // 2026-09-26 20:00 UTC is already 27 Sep 01:30 in India
    expect(businessDate(new Date('2026-09-26T20:00:00Z'))).toBe('2026-09-27');
    expect(businessDate(new Date('2026-09-26T18:00:00Z'))).toBe('2026-09-26');
  });

  it('validates and shifts ISO dates', () => {
    expect(isIsoDate('2026-09-27')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
  });
});
