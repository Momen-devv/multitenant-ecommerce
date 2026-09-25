/** Currency policy for new Store, Product and Plan Price data. */
export const USD_CURRENCY = 'usd' as const;

export function isUsdCurrency(
  currency: string | null | undefined,
): currency is typeof USD_CURRENCY {
  return currency === USD_CURRENCY;
}
