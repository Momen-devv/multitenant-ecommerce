import type { PaymentEnvironment } from './payment-environment';

export const CONNECT_ACCOUNT_EVENT_HANDLER = Symbol(
  'CONNECT_ACCOUNT_EVENT_HANDLER',
);

export interface ConnectAccountEventHandler {
  processAccountUpdated(
    accountId: string,
    environment: PaymentEnvironment,
  ): Promise<boolean>;
  processAccountDeauthorized(
    accountId: string,
    environment: PaymentEnvironment,
  ): Promise<boolean>;
}
