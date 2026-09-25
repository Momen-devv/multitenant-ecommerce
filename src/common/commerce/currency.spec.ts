import { isUsdCurrency, USD_CURRENCY } from './currency';

describe('new business-data currency policy', () => {
  it('accepts only persisted lowercase USD', () => {
    expect(isUsdCurrency(USD_CURRENCY)).toBe(true);
    expect(isUsdCurrency('eur')).toBe(false);
    expect(isUsdCurrency('USD')).toBe(false);
  });
});
