import type { SubscriptionStatus } from '@/common/enums';
import type {
  BillingCustomer,
  BillingWebhookEvent,
  SubscriptionCheckoutAttempt,
} from '@/infrastructure/database/schema/schema.types';

export type SubscriptionProjection = {
  stripeSubscriptionId: string;
  stripeSubscriptionItemId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  storeId?: string;
  planPriceId?: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  canceledAt: Date | null;
  trialEndsAt: Date | null;
  endedAt: Date | null;
};

export type CheckoutSessionResult = {
  sessionId: string;
  url: string;
};

export type ReservePendingCheckoutAttemptInput = {
  storeId: string;
  planPriceId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
};

export type StoreWebhookEventInput = {
  stripeEventId: string;
  eventType: string;
  stripeCreatedAt: Date;
  payload: Record<string, unknown>;
};

export type CheckoutContext = {
  storeId: string;
  storeName: string;
  storeStatus: string;
  planPriceId: string;
  stripePriceId: string | null;
  priceIsActive: boolean;
  planIsActive: boolean;
  provisioningStatus: string;
};

export interface IBillingRepository {
  findCheckoutContext(
    storeId: string,
    planPriceId: string,
  ): Promise<CheckoutContext | undefined>;
  findBillingCustomer(storeId: string): Promise<BillingCustomer | undefined>;
  saveBillingCustomer(
    storeId: string,
    stripeCustomerId: string,
  ): Promise<BillingCustomer>;
  hasNonTerminalSubscription(storeId: string): Promise<boolean>;
  reservePendingCheckoutAttempt(
    input: ReservePendingCheckoutAttemptInput,
  ): Promise<SubscriptionCheckoutAttempt>;
  createOrReuseCheckoutSession(
    attemptId: string,
    createSession: () => Promise<CheckoutSessionResult>,
  ): Promise<CheckoutSessionResult>;
  storeWebhookEvent(
    input: StoreWebhookEventInput,
  ): Promise<{ id: string; status: string }>;
  claimWebhookEvent(
    eventId: string,
    now?: Date,
  ): Promise<BillingWebhookEvent | undefined>;
  findRecoverableWebhookEventIds(limit?: number, now?: Date): Promise<string[]>;
  completeWebhookEvent(eventId: string, leaseToken: string): Promise<boolean>;
  failWebhookEvent(
    eventId: string,
    leaseToken: string,
    error: string,
    nextRetryAt: Date,
  ): Promise<'failed' | 'dead_letter' | 'lease_lost'>;
  replayWebhookEvent(eventId: string): Promise<boolean>;
  reconcileSubscriptionAndCompleteEvent(
    eventId: string,
    leaseToken: string,
    projection: SubscriptionProjection,
    stripeCheckoutSessionId?: string,
  ): Promise<void>;
  expireCheckoutAttemptAndCompleteEvent(
    eventId: string,
    leaseToken: string,
    stripeCheckoutSessionId: string,
  ): Promise<void>;
  expireAbandonedCheckoutAttempts(now?: Date): Promise<number>;
  purgeExpiredWebhookPayloads(now?: Date): Promise<number>;
}
