import {
  MAX_LINE_TOTAL_MINOR_UNITS,
  MAX_ORDER_TOTAL_MINOR_UNITS,
  MAX_UNIT_PRICE_MINOR_UNITS,
  calculateLineTotal,
  sumMinorUnits,
} from './money';

describe('commerce money arithmetic', () => {
  it('uses bounded integer minor units for the largest supported line', () => {
    expect(calculateLineTotal(MAX_UNIT_PRICE_MINOR_UNITS, 99)).toBe(
      MAX_LINE_TOTAL_MINOR_UNITS,
    );
    expect(MAX_LINE_TOTAL_MINOR_UNITS).toBeLessThanOrEqual(
      MAX_ORDER_TOTAL_MINOR_UNITS,
    );
  });

  it('rejects quantities, prices, and totals outside supported bounds', () => {
    expect(() => calculateLineTotal(100, 0)).toThrow(RangeError);
    expect(() => calculateLineTotal(MAX_UNIT_PRICE_MINOR_UNITS + 1, 1)).toThrow(
      RangeError,
    );
    expect(() => sumMinorUnits(MAX_ORDER_TOTAL_MINOR_UNITS, 1)).toThrow(
      RangeError,
    );
  });

  it('never rounds fractional minor units', () => {
    expect(() => calculateLineTotal(1.5, 1)).toThrow(RangeError);
    expect(() => sumMinorUnits(1, 0.5)).toThrow(RangeError);
  });
});
