import {
  getNewCheckoutEligibility,
  isUsdCurrency,
  USD_CURRENCY,
} from './currency';

describe('new checkout currency eligibility', () => {
  it('accepts only persisted lowercase USD for new checkout', () => {
    expect(getNewCheckoutEligibility(USD_CURRENCY)).toEqual({
      eligible: true,
    });
    expect(getNewCheckoutEligibility('eur')).toEqual({
      eligible: false,
      code: 'STORE_CURRENCY_INCOMPATIBLE',
    });
    expect(isUsdCurrency('USD')).toBe(false);
  });
});
