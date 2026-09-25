/**
 * Read-only payment capability needed by checkout. It deliberately does not
 * expose provider account state or onboarding operations.
 */
export interface IStorePaymentReadinessReader {
  isOnlineCheckoutReady(storeId: string): Promise<boolean>;
}
