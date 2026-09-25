import type { PaymentEnvironment } from './payment-environment';

export const CONNECT_PURCHASE_EVENT_HANDLER = Symbol(
  'CONNECT_PURCHASE_EVENT_HANDLER',
);

/** The infrastructure webhook worker delegates commerce decisions to Orders. */
export interface ConnectPurchaseEventHandler {
  processPurchaseEvent(input: {
    accountId: string;
    environment: PaymentEnvironment;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<boolean>;
}
