import { SubscriptionStatus } from '@/common/enums';
import { generateUUIDv7 } from '@/common/utils';
import { store } from '@/infrastructure/database/schema/app.schema';
import {
  organization,
  user,
} from '@/infrastructure/database/schema/auth.schema';
import {
  billingCustomers,
  planPrices,
  plans,
} from '@/infrastructure/database/schema/billing.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { SubscriptionsRepository } from '@/modules/subscriptions/repos/subscriptions.repository';
import { ConflictException } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { BillingCheckoutService } from '../services/billing-checkout.service';
import {
  BillingRepository,
  WEBHOOK_PROCESSING_LEASE_MS,
  type SubscriptionProjection,
} from './billing.repository';

if (
  process.env.REQUIRE_TEST_DATABASE === 'true' &&
  !process.env.TEST_DATABASE_URL
) {
  throw new Error(
    'TEST_DATABASE_URL is required for PostgreSQL integration tests',
  );
}

const describeWithPostgres = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

describeWithPostgres('Billing PostgreSQL concurrency guarantees', () => {
  let firstPool: Pool;
  let secondPool: Pool;
  let firstDb: NodePgDatabase<typeof schema>;
  let secondDb: NodePgDatabase<typeof schema>;
  let firstRepository: BillingRepository;
  let secondRepository: BillingRepository;

  beforeAll(async () => {
    firstPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    secondPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const [{ current_database: databaseName }] = (
      await firstPool.query<{ current_database: string }>(
        'select current_database()',
      )
    ).rows;
    if (!databaseName.toLowerCase().includes('test')) {
      throw new Error(
        'Billing integration tests require a test-named database',
      );
    }
    firstDb = drizzle(firstPool, { schema });
    secondDb = drizzle(secondPool, { schema });
    firstRepository = new BillingRepository(firstDb);
    secondRepository = new BillingRepository(secondDb);
  });

  beforeEach(async () => {
    await firstPool.query(
      'TRUNCATE TABLE billing_webhook_events, subscriptions, subscription_checkout_attempts, billing_customers, plan_prices, plans, store, organization, "user" CASCADE',
    );
  });

  afterAll(async () => {
    await Promise.all([firstPool.end(), secondPool.end()]);
  });

  async function seedCheckoutContext() {
    const token = generateUUIDv7();
    const storeId = generateUUIDv7();
    const planId = generateUUIDv7();
    const planPriceId = generateUUIDv7();
    const ownerId = `owner-${token}`;
    const organizationId = `org-${token}`;
    await firstDb.insert(user).values({
      id: ownerId,
      name: 'Billing Owner',
      email: `${token}@example.com`,
    });
    await firstDb.insert(organization).values({
      id: organizationId,
      name: 'Billing Organization',
      slug: `billing-${token}`,
      createdAt: new Date(),
    });
    await firstDb.insert(store).values({
      id: storeId,
      organizationId,
      ownerId,
      name: 'Billing Store',
      slug: `billing-store-${token}`,
    });
    await firstDb.insert(plans).values({
      id: planId,
      name: 'Professional',
      code: `professional-${token}`,
      stripeProductId: `prod_${token}`,
      provisioningStatus: 'ready',
      isActive: true,
    });
    await firstDb.insert(planPrices).values({
      id: planPriceId,
      planId,
      amount: 2900,
      interval: 'month',
      stripePriceId: `price_${token}`,
      isActive: true,
    });
    await firstDb.insert(billingCustomers).values({
      storeId,
      stripeCustomerId: `cus_${token}`,
    });
    return {
      storeId,
      planPriceId,
      stripePriceId: `price_${token}`,
      stripeCustomerId: `cus_${token}`,
    };
  }

  it('allows only one pending attempt and one Stripe Session for simultaneous Checkout requests', async () => {
    const fixture = await seedCheckoutContext();
    const sessions = new Map<string, Promise<{ id: string; url: string }>>();
    let createdSessions = 0;
    const stripe = {
      customers: { create: jest.fn() },
      checkout: {
        sessions: {
          create: jest.fn(
            async (_params: unknown, options: { idempotencyKey: string }) => {
              let session = sessions.get(options.idempotencyKey);
              if (!session) {
                createdSessions += 1;
                session = Promise.resolve({
                  id: 'cs_single',
                  url: 'https://checkout.stripe.com/c/pay/cs_single',
                });
                sessions.set(options.idempotencyKey, session);
              }
              return session;
            },
          ),
        },
      },
    };
    const firstService = new BillingCheckoutService(
      stripe as never,
      firstRepository,
    );
    const secondService = new BillingCheckoutService(
      stripe as never,
      secondRepository,
    );
    const input = {
      storeId: fixture.storeId,
      customerEmail: 'owner@example.com',
      planPriceId: fixture.planPriceId,
      successUrl: 'https://admin.example.com/billing/success',
      cancelUrl: 'https://admin.example.com/billing/cancel',
      idempotencyKey: 'request-one',
    };

    const [first, second] = await Promise.all([
      firstService.createSubscriptionCheckout(input),
      secondService.createSubscriptionCheckout({
        ...input,
        idempotencyKey: 'request-two',
      }),
    ]);

    expect(first).toEqual(second);
    expect(createdSessions).toBe(1);
    const [firstAttempt, secondAttempt] = await Promise.all([
      firstRepository.reservePendingCheckoutAttempt({
        ...fixture,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        expiresAt: new Date(Date.now() + 60_000),
      }),
      secondRepository.reservePendingCheckoutAttempt({
        ...fixture,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ]);
    expect(firstAttempt.id).toBe(secondAttempt.id);
  });

  it('rejects a different plan while the store has a pending attempt', async () => {
    const fixture = await seedCheckoutContext();
    const otherPlanId = generateUUIDv7();
    const otherPriceId = generateUUIDv7();
    await firstDb.insert(plans).values({
      id: otherPlanId,
      name: 'Enterprise',
      code: `enterprise-${otherPlanId}`,
      stripeProductId: `prod_${otherPlanId}`,
      provisioningStatus: 'ready',
      isActive: true,
    });
    await firstDb.insert(planPrices).values({
      id: otherPriceId,
      planId: otherPlanId,
      amount: 9900,
      interval: 'month',
      stripePriceId: `price_${otherPriceId}`,
      isActive: true,
    });
    await firstRepository.reservePendingCheckoutAttempt({
      ...fixture,
      successUrl: 'https://admin.example.com/success',
      cancelUrl: 'https://admin.example.com/cancel',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const service = new BillingCheckoutService(
      {
        customers: { create: jest.fn() },
        checkout: { sessions: { create: jest.fn() } },
      } as never,
      secondRepository,
    );

    await expect(
      service.createSubscriptionCheckout({
        storeId: fixture.storeId,
        customerEmail: 'owner@example.com',
        planPriceId: otherPriceId,
        successUrl: 'https://admin.example.com/success',
        cancelUrl: 'https://admin.example.com/cancel',
        idempotencyKey: 'different-plan',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('fences a crashed worker after another worker reclaims its stale lease', async () => {
    const fixture = await seedCheckoutContext();
    const stored = await firstRepository.storeWebhookEvent({
      stripeEventId: `evt_${generateUUIDv7()}`,
      eventType: 'customer.subscription.updated',
      stripeCreatedAt: new Date(),
      payload: { id: 'evt_fenced', type: 'customer.subscription.updated' },
    });
    const firstClaim = await firstRepository.claimWebhookEvent(
      stored.id,
      new Date('2026-01-01T00:00:00.000Z'),
    );
    const secondClaim = await secondRepository.claimWebhookEvent(
      stored.id,
      new Date(
        Date.parse('2026-01-01T00:00:00.000Z') +
          WEBHOOK_PROCESSING_LEASE_MS +
          1,
      ),
    );
    expect(firstClaim?.leaseToken).toBeTruthy();
    expect(secondClaim?.leaseToken).toBeTruthy();
    expect(secondClaim?.leaseToken).not.toBe(firstClaim?.leaseToken);

    await firstRepository.reconcileSubscriptionAndCompleteEvent(
      stored.id,
      firstClaim!.leaseToken!,
      projection(fixture),
    );
    const subscriptionsRepository = new SubscriptionsRepository(firstDb);
    await expect(
      subscriptionsRepository.findCurrentByStoreId(fixture.storeId),
    ).resolves.toBeNull();
    await expect(
      firstRepository.failWebhookEvent(
        stored.id,
        firstClaim!.leaseToken!,
        'late worker failure',
        new Date(),
      ),
    ).resolves.toBe('lease_lost');

    await secondRepository.reconcileSubscriptionAndCompleteEvent(
      stored.id,
      secondClaim!.leaseToken!,
      projection(fixture),
    );
    await expect(
      subscriptionsRepository.findCurrentByStoreId(fixture.storeId),
    ).resolves.toEqual(expect.objectContaining({ status: 'active' }));
    await expect(
      firstRepository.claimWebhookEvent(stored.id, new Date('2030-01-01')),
    ).resolves.toBeUndefined();
  });

  it('stores duplicate deliveries once and allows only one active claim', async () => {
    const stripeEventId = `evt_${generateUUIDv7()}`;
    const input = {
      stripeEventId,
      eventType: 'invoice.paid',
      stripeCreatedAt: new Date(),
      payload: { id: stripeEventId, type: 'invoice.paid' },
    };

    const [firstStored, secondStored] = await Promise.all([
      firstRepository.storeWebhookEvent(input),
      secondRepository.storeWebhookEvent(input),
    ]);
    expect(firstStored.id).toBe(secondStored.id);

    const [firstClaim, secondClaim] = await Promise.all([
      firstRepository.claimWebhookEvent(firstStored.id),
      secondRepository.claimWebhookEvent(secondStored.id),
    ]);
    expect([firstClaim, secondClaim].filter(Boolean)).toHaveLength(1);
  });

  it('retries a failed claim and recovers again after a worker crash', async () => {
    const stored = await firstRepository.storeWebhookEvent({
      stripeEventId: `evt_${generateUUIDv7()}`,
      eventType: 'invoice.paid',
      stripeCreatedAt: new Date(),
      payload: { id: 'evt_retry', type: 'invoice.paid' },
    });
    const startedAt = new Date('2026-01-01T00:00:00.000Z');
    const crashedClaim = await firstRepository.claimWebhookEvent(
      stored.id,
      startedAt,
    );
    const recoveredClaim = await secondRepository.claimWebhookEvent(
      stored.id,
      new Date(startedAt.getTime() + WEBHOOK_PROCESSING_LEASE_MS + 1),
    );
    const retryAt = new Date('2026-01-01T01:00:00.000Z');
    await expect(
      secondRepository.failWebhookEvent(
        stored.id,
        recoveredClaim!.leaseToken!,
        'temporary Stripe failure',
        retryAt,
      ),
    ).resolves.toBe('failed');
    await expect(
      firstRepository.claimWebhookEvent(
        stored.id,
        new Date('2026-01-01T00:59:59.999Z'),
      ),
    ).resolves.toBeUndefined();
    const retriedClaim = await firstRepository.claimWebhookEvent(
      stored.id,
      retryAt,
    );
    expect(retriedClaim?.attempts).toBe(3);
    expect(retriedClaim?.leaseToken).not.toBe(crashedClaim?.leaseToken);
    expect(retriedClaim?.leaseToken).not.toBe(recoveredClaim?.leaseToken);
  });

  it('rolls back subscription mutations when reconciliation fails', async () => {
    const fixture = await seedCheckoutContext();
    const stored = await firstRepository.storeWebhookEvent({
      stripeEventId: `evt_${generateUUIDv7()}`,
      eventType: 'customer.subscription.updated',
      stripeCreatedAt: new Date(),
      payload: { id: 'evt_rollback', type: 'customer.subscription.updated' },
    });
    const claim = await firstRepository.claimWebhookEvent(stored.id);

    await expect(
      firstRepository.reconcileSubscriptionAndCompleteEvent(
        stored.id,
        claim!.leaseToken!,
        {
          ...projection(fixture),
          planPriceId: undefined,
          stripePriceId: 'price_unknown',
        },
      ),
    ).rejects.toThrow('Cannot resolve plan price price_unknown');
    await expect(
      new SubscriptionsRepository(firstDb).findCurrentByStoreId(
        fixture.storeId,
      ),
    ).resolves.toBeNull();
    await expect(
      firstRepository.failWebhookEvent(
        stored.id,
        claim!.leaseToken!,
        'projection failed',
        new Date(),
      ),
    ).resolves.toBe('failed');
  });

  it('purges terminal payloads without losing duplicate-event tombstones', async () => {
    const stripeEventId = `evt_${generateUUIDv7()}`;
    const input = {
      stripeEventId,
      eventType: 'invoice.paid',
      stripeCreatedAt: new Date(),
      payload: { id: stripeEventId, type: 'invoice.paid' },
    };
    const stored = await firstRepository.storeWebhookEvent(input);
    const claim = await firstRepository.claimWebhookEvent(stored.id);
    await expect(
      firstRepository.completeWebhookEvent(stored.id, claim!.leaseToken!),
    ).resolves.toBe(true);

    await expect(
      firstRepository.purgeExpiredWebhookPayloads(new Date('2100-01-01')),
    ).resolves.toBe(1);
    await expect(secondRepository.storeWebhookEvent(input)).resolves.toEqual({
      id: stored.id,
      status: 'completed',
    });
    await expect(firstRepository.replayWebhookEvent(stored.id)).resolves.toBe(
      false,
    );
  });

  it('moves a repeatedly failing event to a terminal dead-letter state', async () => {
    const stored = await firstRepository.storeWebhookEvent({
      stripeEventId: `evt_${generateUUIDv7()}`,
      eventType: 'invoice.payment_failed',
      stripeCreatedAt: new Date(),
      payload: { id: 'evt_dead_letter', type: 'invoice.payment_failed' },
    });
    const now = new Date('2026-01-01T00:00:00.000Z');
    let finalStatus: string | undefined;

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const claim = await firstRepository.claimWebhookEvent(stored.id, now);
      expect(claim?.attempts).toBe(attempt);
      finalStatus = await firstRepository.failWebhookEvent(
        stored.id,
        claim!.leaseToken!,
        `failure ${attempt}`,
        now,
      );
    }

    expect(finalStatus).toBe('dead_letter');
    await expect(
      secondRepository.claimWebhookEvent(stored.id, now),
    ).resolves.toBeUndefined();
  });

  it('recovers an expired attempt without a Stripe expiration webhook', async () => {
    const fixture = await seedCheckoutContext();
    const expiresAt = new Date(Date.now() + 60_000);
    const firstAttempt = await firstRepository.reservePendingCheckoutAttempt({
      ...fixture,
      successUrl: 'https://admin.example.com/success',
      cancelUrl: 'https://admin.example.com/cancel',
      expiresAt,
    });

    await expect(
      firstRepository.expireAbandonedCheckoutAttempts(
        new Date(expiresAt.getTime() + 1),
      ),
    ).resolves.toBe(1);
    const replacement = await secondRepository.reservePendingCheckoutAttempt({
      ...fixture,
      successUrl: 'https://admin.example.com/success',
      cancelUrl: 'https://admin.example.com/cancel',
      expiresAt: new Date(expiresAt.getTime() + 60_000),
    });
    expect(replacement.id).not.toBe(firstAttempt.id);
  });

  it('rejects a Checkout attempt whose expiry is not after creation', async () => {
    const fixture = await seedCheckoutContext();

    let databaseError: unknown;
    try {
      await firstRepository.reservePendingCheckoutAttempt({
        ...fixture,
        successUrl: 'https://admin.example.com/success',
        cancelUrl: 'https://admin.example.com/cancel',
        expiresAt: new Date('2000-01-01T00:00:00.000Z'),
      });
    } catch (error) {
      databaseError = error;
    }

    expect(databaseError).toBeDefined();
    expect((databaseError as { cause?: unknown }).cause).toMatchObject({
      code: '23514',
      constraint: 'subscription_checkout_attempts_expiry_after_creation_check',
    });
  });

  function projection(fixture: {
    storeId: string;
    planPriceId: string;
    stripePriceId: string;
    stripeCustomerId: string;
  }): SubscriptionProjection {
    return {
      stripeSubscriptionId: 'sub_fenced',
      stripeSubscriptionItemId: 'si_fenced',
      stripeCustomerId: fixture.stripeCustomerId,
      stripePriceId: fixture.stripePriceId,
      storeId: fixture.storeId,
      planPriceId: fixture.planPriceId,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      cancelAt: null,
      canceledAt: null,
      trialEndsAt: null,
      endedAt: null,
    };
  }
});
