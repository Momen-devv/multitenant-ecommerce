export type StoreCheckoutEligibility = {
  storeExists: boolean;
  canAcceptOrders: boolean;
  onlinePaymentReady: boolean;
};

/**
 * Resolves the effective prerequisites for checkout without exposing billing
 * or payment-provider implementation details to its callers.
 */
export interface ICheckoutEligibilityReader {
  getForStore(storeId: string): Promise<StoreCheckoutEligibility>;
}
