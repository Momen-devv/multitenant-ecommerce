export type ConnectedAccount = {
  id: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  cardPaymentsActive: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  disabledReason: string | null;
  deauthorized: boolean;
};

export type AccountOnboardingLink = {
  url: string;
  expiresAt: Date;
};

export type CreateConnectedAccountInput = {
  country: string;
  email?: string;
  idempotencyKey: string;
};

export type CheckoutLineItem =
  | {
      priceId: string;
      priceData?: never;
      quantity: number;
    }
  | {
      priceId?: never;
      priceData: {
        currency: 'usd';
        unitAmount: number;
        productName: string;
        productDescription?: string;
      };
      quantity: number;
    };

export type CreateCheckoutSessionInput = {
  mode: 'payment' | 'subscription';
  customerId?: string;
  customerEmail?: string;
  lineItems: CheckoutLineItem[];
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  paymentIntentMetadata?: Record<string, string>;
  subscriptionMetadata?: Record<string, string>;
  expiresAt?: Date;
};

export type CheckoutSession = {
  id: string;
  url: string | null;
  status: string | null;
  paymentStatus: string | null;
  paymentIntentId: string | null;
  subscriptionId: string | null;
  expiresAt: Date | null;
  metadata: Record<string, string>;
};

export type PaymentIntent = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  chargeId: string | null;
  metadata: Record<string, string>;
};

export type PaymentCharge = {
  id: string;
  amount: number;
  currency: string;
  paymentIntentId: string | null;
  status: string | null;
  refunded: boolean;
  refundedAmount: number;
};

export type CreateRefundInput = {
  paymentIntentId?: string;
  chargeId?: string;
  amount?: number;
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  metadata?: Record<string, string>;
};

export type PaymentRefund = {
  id: string;
  status: string | null;
  amount: number;
  currency: string;
  paymentIntentId: string | null;
  chargeId: string | null;
};

export interface PaymentGateway {
  createConnectedAccount(
    input: CreateConnectedAccountInput,
  ): Promise<ConnectedAccount>;
  retrieveConnectedAccount(accountId: string): Promise<ConnectedAccount>;
  createOnboardingLink(accountId: string): Promise<AccountOnboardingLink>;

  createCheckoutSession(
    accountId: string,
    input: CreateCheckoutSessionInput,
    idempotencyKey: string,
  ): Promise<CheckoutSession>;
  retrieveCheckoutSession(
    accountId: string,
    sessionId: string,
  ): Promise<CheckoutSession>;
  expireCheckoutSession(
    accountId: string,
    sessionId: string,
  ): Promise<CheckoutSession>;
  retrievePaymentIntent(
    accountId: string,
    paymentIntentId: string,
  ): Promise<PaymentIntent>;
  retrieveCharge(accountId: string, chargeId: string): Promise<PaymentCharge>;
  createRefund(
    accountId: string,
    input: CreateRefundInput,
    idempotencyKey: string,
  ): Promise<PaymentRefund>;
  retrieveRefund(accountId: string, refundId: string): Promise<PaymentRefund>;
}
