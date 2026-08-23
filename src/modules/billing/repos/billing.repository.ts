import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { SubscriptionStatus } from '@/common/enums';
import { store } from '@/infrastructure/database/schema/app.schema';
import {
  billingCustomers,
  planPrices,
  plans,
  subscriptionCheckoutAttempts,
  subscriptions,
} from '@/infrastructure/database/schema/billing.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, notInArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

const TERMINAL_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.INCOMPLETE_EXPIRED,
  SubscriptionStatus.CANCELED,
];
export const CHECKOUT_SESSION_LIFETIME_MS = 60 * 60 * 1000;

export type CheckoutSessionResult = {
  sessionId: string;
  url: string;
};

@Injectable()
export class BillingRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findCheckoutContext(storeId: string, planPriceId: string) {
    const [row] = await this.db
      .select({
        storeId: store.id,
        storeName: store.name,
        storeStatus: store.status,
        planPriceId: planPrices.id,
        stripePriceId: planPrices.stripePriceId,
        priceIsActive: planPrices.isActive,
        planIsActive: plans.isActive,
        provisioningStatus: plans.provisioningStatus,
      })
      .from(store)
      .innerJoin(planPrices, eq(planPrices.id, planPriceId))
      .innerJoin(plans, eq(plans.id, planPrices.planId))
      .where(eq(store.id, storeId))
      .limit(1);

    return row;
  }

  findBillingCustomer(storeId: string) {
    return this.db.query.billingCustomers.findFirst({
      where: eq(billingCustomers.storeId, storeId),
    });
  }

  async saveBillingCustomer(storeId: string, stripeCustomerId: string) {
    await this.db
      .insert(billingCustomers)
      .values({ storeId, stripeCustomerId })
      .onConflictDoNothing({ target: billingCustomers.storeId });

    const customer = await this.findBillingCustomer(storeId);
    if (!customer) {
      throw new Error(`Billing customer for store ${storeId} was not saved`);
    }

    return customer;
  }

  async hasNonTerminalSubscription(storeId: string): Promise<boolean> {
    const existing = await this.db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.storeId, storeId),
        notInArray(subscriptions.status, TERMINAL_SUBSCRIPTION_STATUSES),
      ),
      columns: { id: true },
    });

    return Boolean(existing);
  }

  async reservePendingCheckoutAttempt(input: {
    storeId: string;
    planPriceId: string;
    stripeCustomerId: string;
    stripePriceId: string;
    successUrl: string;
    cancelUrl: string;
    expiresAt: Date;
  }) {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(subscriptionCheckoutAttempts)
        .values(input)
        .onConflictDoNothing()
        .returning();

      if (created) return created;

      const existing = await tx.query.subscriptionCheckoutAttempts.findFirst({
        where: and(
          eq(subscriptionCheckoutAttempts.storeId, input.storeId),
          eq(subscriptionCheckoutAttempts.status, 'pending'),
        ),
      });
      if (!existing) {
        throw new Error(
          `Pending Checkout attempt for store ${input.storeId} disappeared`,
        );
      }

      return existing;
    });
  }

  async createOrReuseCheckoutSession(
    attemptId: string,
    createSession: () => Promise<CheckoutSessionResult>,
  ): Promise<CheckoutSessionResult> {
    const attempt = await this.db.query.subscriptionCheckoutAttempts.findFirst({
      where: eq(subscriptionCheckoutAttempts.id, attemptId),
    });

    if (!attempt || attempt.status !== 'pending') {
      throw new Error(`Pending Checkout attempt ${attemptId} was not found`);
    }
    if (attempt.stripeCheckoutSessionId && attempt.stripeCheckoutSessionUrl) {
      return {
        sessionId: attempt.stripeCheckoutSessionId,
        url: attempt.stripeCheckoutSessionUrl,
      };
    }

    const session = await createSession();
    const [saved] = await this.db
      .update(subscriptionCheckoutAttempts)
      .set({
        stripeCheckoutSessionId: session.sessionId,
        stripeCheckoutSessionUrl: session.url,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(subscriptionCheckoutAttempts.id, attemptId),
          eq(subscriptionCheckoutAttempts.status, 'pending'),
          gt(subscriptionCheckoutAttempts.expiresAt, new Date()),
        ),
      )
      .returning({ id: subscriptionCheckoutAttempts.id });

    if (saved) return session;

    const current = await this.db.query.subscriptionCheckoutAttempts.findFirst({
      where: eq(subscriptionCheckoutAttempts.id, attemptId),
    });
    if (current?.stripeCheckoutSessionId && current.stripeCheckoutSessionUrl) {
      return {
        sessionId: current.stripeCheckoutSessionId,
        url: current.stripeCheckoutSessionUrl,
      };
    }
    throw new Error(`Pending Checkout attempt ${attemptId} expired`);
  }
}
