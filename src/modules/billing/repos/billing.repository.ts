import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { SubscriptionStatus } from '@/common/enums';
import { generateUUIDv7 } from '@/common/utils/uuidv7';
import { store } from '@/infrastructure/database/schema/app.schema';
import {
  billingCustomers,
  billingWebhookEvents,
  planPrices,
  plans,
  subscriptionCheckoutAttempts,
  subscriptions,
} from '@/infrastructure/database/schema/billing.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  gte,
  gt,
  inArray,
  isNotNull,
  lt,
  lte,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  IBillingRepository,
  CheckoutSessionResult,
  SubscriptionProjection,
} from '../interfaces/repos/billing-repository.interface';
export type {
  CheckoutSessionResult,
  SubscriptionProjection,
} from '../interfaces/repos/billing-repository.interface';

const TERMINAL_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.INCOMPLETE_EXPIRED,
  SubscriptionStatus.CANCELED,
];
export const WEBHOOK_PROCESSING_LEASE_MS = 5 * 60 * 1000;
export const WEBHOOK_MAX_ATTEMPTS = 8;
export const CHECKOUT_SESSION_LIFETIME_MS = 60 * 60 * 1000;
export const WEBHOOK_PAYLOAD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class BillingRepository implements IBillingRepository {
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

    // Stripe receives a deterministic idempotency key from the service. Calling
    // it outside a transaction avoids holding a PostgreSQL connection/row lock
    // during network I/O while concurrent callers still receive one Session.
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

  async storeWebhookEvent(input: {
    stripeEventId: string;
    eventType: string;
    stripeCreatedAt: Date;
    payload: Record<string, unknown>;
  }): Promise<{ id: string; status: string }> {
    const inserted = await this.db
      .insert(billingWebhookEvents)
      .values({
        ...input,
        payloadExpiresAt: new Date(Date.now() + WEBHOOK_PAYLOAD_RETENTION_MS),
      })
      .onConflictDoNothing({ target: billingWebhookEvents.stripeEventId })
      .returning({
        id: billingWebhookEvents.id,
        status: billingWebhookEvents.status,
      });

    if (inserted.length === 1) return inserted[0];

    const existing = await this.db.query.billingWebhookEvents.findFirst({
      where: eq(billingWebhookEvents.stripeEventId, input.stripeEventId),
      columns: { id: true, status: true },
    });

    if (!existing) {
      throw new Error(`Webhook event ${input.stripeEventId} disappeared`);
    }

    return existing;
  }

  async claimWebhookEvent(
    eventId: string,
    now = new Date(),
  ): Promise<typeof billingWebhookEvents.$inferSelect | undefined> {
    const staleOrDue = or(
      and(
        eq(billingWebhookEvents.status, 'failed'),
        lte(billingWebhookEvents.nextRetryAt, now),
      ),
      and(
        eq(billingWebhookEvents.status, 'processing'),
        lte(billingWebhookEvents.leaseExpiresAt, now),
      ),
    );

    await this.db
      .update(billingWebhookEvents)
      .set({
        status: 'dead_letter',
        leaseExpiresAt: null,
        leaseToken: null,
        lastError: 'Webhook processing lease expired after maximum attempts',
        updatedAt: now,
      })
      .where(
        and(
          eq(billingWebhookEvents.id, eventId),
          staleOrDue,
          gte(billingWebhookEvents.attempts, WEBHOOK_MAX_ATTEMPTS),
        ),
      );

    const [claimed] = await this.db
      .update(billingWebhookEvents)
      .set({
        status: 'processing',
        attempts: sql`${billingWebhookEvents.attempts} + 1`,
        lastError: null,
        nextRetryAt: now,
        leaseExpiresAt: new Date(now.getTime() + WEBHOOK_PROCESSING_LEASE_MS),
        leaseToken: generateUUIDv7(),
        updatedAt: now,
      })
      .where(
        and(
          eq(billingWebhookEvents.id, eventId),
          or(eq(billingWebhookEvents.status, 'pending'), staleOrDue),
          lt(billingWebhookEvents.attempts, WEBHOOK_MAX_ATTEMPTS),
          isNotNull(billingWebhookEvents.payload),
        ),
      )
      .returning();

    return claimed;
  }

  async findRecoverableWebhookEventIds(
    limit = 100,
    now = new Date(),
  ): Promise<string[]> {
    const rows = await this.db
      .select({ id: billingWebhookEvents.id })
      .from(billingWebhookEvents)
      .where(
        and(
          isNotNull(billingWebhookEvents.payload),
          or(
            eq(billingWebhookEvents.status, 'pending'),
            and(
              eq(billingWebhookEvents.status, 'failed'),
              lte(billingWebhookEvents.nextRetryAt, now),
            ),
            and(
              eq(billingWebhookEvents.status, 'processing'),
              lte(billingWebhookEvents.leaseExpiresAt, now),
            ),
          ),
        ),
      )
      .orderBy(asc(billingWebhookEvents.nextRetryAt))
      .limit(limit);

    return rows.map(({ id }) => id);
  }

  async completeWebhookEvent(eventId: string, leaseToken: string) {
    return this.db.transaction(async (tx) => {
      const owned = await this.lockOwnedWebhookClaim(tx, eventId, leaseToken);
      if (!owned) return false;
      await tx
        .update(billingWebhookEvents)
        .set({
          status: 'completed',
          processedAt: new Date(),
          lastError: null,
          leaseExpiresAt: null,
          leaseToken: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(billingWebhookEvents.id, eventId),
            eq(billingWebhookEvents.leaseToken, leaseToken),
          ),
        );
      return true;
    });
  }

  async failWebhookEvent(
    eventId: string,
    leaseToken: string,
    error: string,
    nextRetryAt: Date,
  ): Promise<'failed' | 'dead_letter' | 'lease_lost'> {
    return this.db.transaction(async (tx) => {
      const [event] = await tx
        .select({
          attempts: billingWebhookEvents.attempts,
          status: billingWebhookEvents.status,
        })
        .from(billingWebhookEvents)
        .where(
          and(
            eq(billingWebhookEvents.id, eventId),
            eq(billingWebhookEvents.leaseToken, leaseToken),
          ),
        )
        .for('update')
        .limit(1);

      if (!event) return 'lease_lost';
      if (event.status !== 'processing')
        return event.status === 'dead_letter' ? 'dead_letter' : 'failed';

      const status =
        event.attempts >= WEBHOOK_MAX_ATTEMPTS ? 'dead_letter' : 'failed';
      await tx
        .update(billingWebhookEvents)
        .set({
          status,
          lastError: error.slice(0, 1000),
          nextRetryAt,
          leaseExpiresAt: null,
          leaseToken: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(billingWebhookEvents.id, eventId),
            eq(billingWebhookEvents.leaseToken, leaseToken),
          ),
        );

      return status;
    });
  }

  async replayWebhookEvent(eventId: string): Promise<boolean> {
    const replayed = await this.db
      .update(billingWebhookEvents)
      .set({
        status: 'pending',
        attempts: 0,
        lastError: null,
        nextRetryAt: new Date(),
        leaseExpiresAt: null,
        leaseToken: null,
        processedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(billingWebhookEvents.id, eventId),
          inArray(billingWebhookEvents.status, ['failed', 'dead_letter']),
          isNotNull(billingWebhookEvents.payload),
          sql`${billingWebhookEvents.payload}->>'legacyPayloadUnavailable' IS DISTINCT FROM 'true'`,
        ),
      )
      .returning({ id: billingWebhookEvents.id });

    return replayed.length === 1;
  }

  async reconcileSubscriptionAndCompleteEvent(
    eventId: string,
    leaseToken: string,
    projection: SubscriptionProjection,
    stripeCheckoutSessionId?: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const owned = await this.lockOwnedWebhookClaim(tx, eventId, leaseToken);
      if (!owned) return;
      let resolvedStoreId = projection.storeId;

      if (resolvedStoreId) {
        const knownStore = await tx.query.store.findFirst({
          where: eq(store.id, resolvedStoreId),
          columns: { id: true },
        });
        if (!knownStore) resolvedStoreId = undefined;
      }

      const existingCustomer = await tx.query.billingCustomers.findFirst({
        where: eq(
          billingCustomers.stripeCustomerId,
          projection.stripeCustomerId,
        ),
      });
      resolvedStoreId ??= existingCustomer?.storeId;

      if (!resolvedStoreId) {
        throw new Error(
          `Cannot resolve store for Stripe customer ${projection.stripeCustomerId}`,
        );
      }

      if (!existingCustomer) {
        await tx
          .insert(billingCustomers)
          .values({
            storeId: resolvedStoreId,
            stripeCustomerId: projection.stripeCustomerId,
          })
          .onConflictDoNothing({ target: billingCustomers.storeId });

        const storedCustomer = await tx.query.billingCustomers.findFirst({
          where: eq(billingCustomers.storeId, resolvedStoreId),
        });
        if (
          !storedCustomer ||
          storedCustomer.stripeCustomerId !== projection.stripeCustomerId
        ) {
          throw new Error('Store is linked to another Stripe customer');
        }
      } else if (existingCustomer.storeId !== resolvedStoreId) {
        throw new Error('Stripe customer metadata points to another store');
      }

      let resolvedPlanPriceId = projection.planPriceId;
      let knownPrice = resolvedPlanPriceId
        ? await tx.query.planPrices.findFirst({
            where: eq(planPrices.id, resolvedPlanPriceId),
          })
        : undefined;

      if (knownPrice?.stripePriceId !== projection.stripePriceId) {
        knownPrice = undefined;
        resolvedPlanPriceId = undefined;
      }

      if (!knownPrice) {
        knownPrice = await tx.query.planPrices.findFirst({
          where: eq(planPrices.stripePriceId, projection.stripePriceId),
        });
        resolvedPlanPriceId = knownPrice?.id;
      }

      if (!resolvedPlanPriceId) {
        throw new Error(
          `Cannot resolve plan price ${projection.stripePriceId}`,
        );
      }

      await tx
        .insert(subscriptions)
        .values({
          storeId: resolvedStoreId,
          planPriceId: resolvedPlanPriceId,
          stripeSubscriptionId: projection.stripeSubscriptionId,
          stripeSubscriptionItemId: projection.stripeSubscriptionItemId,
          status: projection.status,
          currentPeriodStart: projection.currentPeriodStart,
          currentPeriodEnd: projection.currentPeriodEnd,
          cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
          cancelAt: projection.cancelAt,
          canceledAt: projection.canceledAt,
          trialEndsAt: projection.trialEndsAt,
          endedAt: projection.endedAt,
        })
        .onConflictDoUpdate({
          target: subscriptions.stripeSubscriptionId,
          set: {
            storeId: resolvedStoreId,
            planPriceId: resolvedPlanPriceId,
            stripeSubscriptionItemId: projection.stripeSubscriptionItemId,
            status: projection.status,
            currentPeriodStart: projection.currentPeriodStart,
            currentPeriodEnd: projection.currentPeriodEnd,
            cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
            cancelAt: projection.cancelAt,
            canceledAt: projection.canceledAt,
            trialEndsAt: projection.trialEndsAt,
            endedAt: projection.endedAt,
            updatedAt: new Date(),
          },
        });

      if (stripeCheckoutSessionId) {
        await tx
          .update(subscriptionCheckoutAttempts)
          .set({
            status: 'completed',
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(
                subscriptionCheckoutAttempts.stripeCheckoutSessionId,
                stripeCheckoutSessionId,
              ),
              eq(subscriptionCheckoutAttempts.status, 'pending'),
            ),
          );
      }

      await tx
        .update(billingWebhookEvents)
        .set({
          status: 'completed',
          processedAt: new Date(),
          lastError: null,
          leaseExpiresAt: null,
          leaseToken: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(billingWebhookEvents.id, eventId),
            eq(billingWebhookEvents.leaseToken, leaseToken),
          ),
        );
    });
  }

  async expireCheckoutAttemptAndCompleteEvent(
    eventId: string,
    leaseToken: string,
    stripeCheckoutSessionId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const owned = await this.lockOwnedWebhookClaim(tx, eventId, leaseToken);
      if (!owned) return;
      await tx
        .update(subscriptionCheckoutAttempts)
        .set({
          status: 'expired',
          expiredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              subscriptionCheckoutAttempts.stripeCheckoutSessionId,
              stripeCheckoutSessionId,
            ),
            eq(subscriptionCheckoutAttempts.status, 'pending'),
          ),
        );

      await tx
        .update(billingWebhookEvents)
        .set({
          status: 'completed',
          processedAt: new Date(),
          lastError: null,
          leaseExpiresAt: null,
          leaseToken: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(billingWebhookEvents.id, eventId),
            eq(billingWebhookEvents.leaseToken, leaseToken),
          ),
        );
    });
  }

  async expireAbandonedCheckoutAttempts(now = new Date()): Promise<number> {
    const expired = await this.db
      .update(subscriptionCheckoutAttempts)
      .set({ status: 'expired', expiredAt: now, updatedAt: now })
      .where(
        and(
          eq(subscriptionCheckoutAttempts.status, 'pending'),
          lte(subscriptionCheckoutAttempts.expiresAt, now),
        ),
      )
      .returning({ id: subscriptionCheckoutAttempts.id });
    return expired.length;
  }

  async purgeExpiredWebhookPayloads(now = new Date()): Promise<number> {
    const purged = await this.db
      .update(billingWebhookEvents)
      .set({ payload: null, payloadPurgedAt: now, updatedAt: now })
      .where(
        and(
          inArray(billingWebhookEvents.status, ['completed', 'dead_letter']),
          isNotNull(billingWebhookEvents.payload),
          lte(billingWebhookEvents.payloadExpiresAt, now),
        ),
      )
      .returning({ id: billingWebhookEvents.id });
    return purged.length;
  }

  private async lockOwnedWebhookClaim(
    tx: Parameters<Parameters<typeof this.db.transaction>[0]>[0],
    eventId: string,
    leaseToken: string,
  ): Promise<boolean> {
    const [event] = await tx
      .select({ id: billingWebhookEvents.id })
      .from(billingWebhookEvents)
      .where(
        and(
          eq(billingWebhookEvents.id, eventId),
          eq(billingWebhookEvents.status, 'processing'),
          eq(billingWebhookEvents.leaseToken, leaseToken),
        ),
      )
      .for('update')
      .limit(1);
    return Boolean(event);
  }
}
