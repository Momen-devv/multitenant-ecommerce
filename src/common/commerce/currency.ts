/** Currency policy for newly-created checkout-era business data. */
export const USD_CURRENCY = 'usd' as const;

export type NewCheckoutEligibility =
  | { eligible: true }
  | {
      eligible: false;
      code: 'STORE_CURRENCY_INCOMPATIBLE';
    };

/**
 * Historical rows may keep their original ISO currency. New checkout is only
 * available when the Store's persisted currency is USD.
 */
export function getNewCheckoutEligibility(
  currency: string | null | undefined,
): NewCheckoutEligibility {
  return currency === USD_CURRENCY
    ? { eligible: true }
    : { eligible: false, code: 'STORE_CURRENCY_INCOMPATIBLE' };
}

export function isUsdCurrency(
  currency: string | null | undefined,
): currency is typeof USD_CURRENCY {
  return currency === USD_CURRENCY;
}
