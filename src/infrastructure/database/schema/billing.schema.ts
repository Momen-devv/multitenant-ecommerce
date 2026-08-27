import {
  PlanProvisioningStatus,
  SubscriptionStatus,
} from '@/common/enums/index';
import { generateUUIDv7 } from '@/common/utils/uuidv7';
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { store } from './app.schema';

export const planProvisioningStatusEnum = pgEnum('plan_provisioning_status', [
  PlanProvisioningStatus.PENDING,
  PlanProvisioningStatus.PROCESSING,
  PlanProvisioningStatus.READY,
  PlanProvisioningStatus.FAILED,
]);

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),

    name: varchar('name', { length: 100 }).notNull(),
    code: varchar('code', { length: 64 }).notNull().unique('plans_code_unique'), // starter, pro

    description: varchar('description', { length: 500 }),

    // Your application permissionsâ€”not Stripe permissions
    features: jsonb('features')
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),

    limits: jsonb('limits')
      .$type<Record<string, number>>()
      .notNull()
      .default({}),

    stripeProductId: varchar('stripe_product_id', { length: 255 }).unique(),

    provisioningStatus: planProvisioningStatusEnum('provisioning_status')
      .$type<PlanProvisioningStatus>()
      .notNull()
      .default(PlanProvisioningStatus.PENDING),
    provisioningVersion: integer('provisioning_version').notNull().default(1),
    provisioningError: varchar('provisioning_error', { length: 1000 }),

    isActive: boolean('is_active').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('plans_name_trgm_idx').using(
      'gin',
      table.name.asc().op('gin_trgm_ops'),
    ),
    index('plans_code_trgm_idx').using(
      'gin',
      table.code.asc().op('gin_trgm_ops'),
    ),
    check(
      'plans_active_requires_ready_stripe_product_check',
      sql`${table.isActive} = false OR (${table.provisioningStatus} = 'ready' AND ${table.stripeProductId} IS NOT NULL)`,
    ),
  ],
);

export const plansRelations = relations(plans, ({ many }) => ({
  prices: many(planPrices),
}));
export const billingIntervalEnum = pgEnum('billing_interval', [
  'month',
  'year',
]);

export const planPrices = pgTable(
  'plan_prices',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),

    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),

    // Store money in the smallest currency unit: $29.00 = 2900
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('usd'),

    interval: billingIntervalEnum('interval').notNull(),

    stripePriceId: varchar('stripe_price_id', { length: 255 }).unique(),

    // Useful to find the correct Stripe Price without hardcoding its ID
    stripeLookupKey: varchar('stripe_lookup_key', { length: 255 }).unique(),

    // False = old price is not offered to new tenants.
    // Keep it for existing subscriptions and payment history.
    isActive: boolean('is_active').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'plan_prices_active_requires_stripe_price_check',
      sql`${table.isActive} = false OR ${table.stripePriceId} IS NOT NULL`,
    ),
  ],
);

export const planPricesRelations = relations(planPrices, ({ one }) => ({
  plan: one(plans, {
    fields: [planPrices.planId],
    references: [plans.id],
  }),
}));

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  SubscriptionStatus.INCOMPLETE,
  SubscriptionStatus.INCOMPLETE_EXPIRED,
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.CANCELED,
  SubscriptionStatus.UNPAID,
  SubscriptionStatus.PAUSED,
]);

export const billingWebhookEventStatusEnum = pgEnum(
  'billing_webhook_event_status',
  ['pending', 'processing', 'completed', 'failed', 'dead_letter'],
);

export const subscriptionCheckoutAttemptStatusEnum = pgEnum(
  'subscription_checkout_attempt_status',
  ['pending', 'completed', 'expired'],
);

export const billingWebhookEvents = pgTable(
  'billing_webhook_events',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    stripeEventId: varchar('stripe_event_id', { length: 255 }).notNull(),
    eventType: varchar('event_type', { length: 255 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    status: billingWebhookEventStatusEnum('status')
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: varchar('last_error', { length: 1000 }),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    leaseToken: uuid('lease_token'),
    payloadExpiresAt: timestamp('payload_expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
    payloadPurgedAt: timestamp('payload_purged_at', { withTimezone: true }),
    stripeCreatedAt: timestamp('stripe_created_at', {
      withTimezone: true,
    }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('billing_webhook_events_stripe_event_id_uidx').on(
      table.stripeEventId,
    ),
    index('billing_webhook_events_status_idx').on(table.status),
    index('billing_webhook_events_due_idx').on(table.status, table.nextRetryAt),
    index('billing_webhook_events_lease_idx').on(
      table.status,
      table.leaseExpiresAt,
    ),
    index('billing_webhook_events_payload_expiry_idx').on(
      table.status,
      table.payloadExpiresAt,
    ),
    check(
      'billing_webhook_events_processing_lease_check',
      sql`(${table.status} = 'processing') = (${table.leaseToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL)`,
    ),
    check(
      'billing_webhook_events_recoverable_payload_check',
      sql`${table.status} IN ('completed', 'dead_letter') OR ${table.payload} IS NOT NULL`,
    ),
    check(
      'billing_webhook_events_attempts_nonnegative_check',
      sql`${table.attempts} >= 0`,
    ),
  ],
);

export const billingCustomers = pgTable(
  'billing_customers',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id')
      .notNull()
      .references(() => store.id, { onDelete: 'restrict' }),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('billing_customers_store_id_uidx').on(table.storeId),
    uniqueIndex('billing_customers_stripe_customer_id_uidx').on(
      table.stripeCustomerId,
    ),
  ],
);

export const subscriptionCheckoutAttempts = pgTable(
  'subscription_checkout_attempts',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id')
      .notNull()
      .references(() => store.id, { onDelete: 'restrict' }),
    planPriceId: uuid('plan_price_id')
      .notNull()
      .references(() => planPrices.id, { onDelete: 'restrict' }),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }).notNull(),
    stripePriceId: varchar('stripe_price_id', { length: 255 }).notNull(),
    successUrl: text('success_url').notNull(),
    cancelUrl: text('cancel_url').notNull(),
    stripeCheckoutSessionId: varchar('stripe_checkout_session_id', {
      length: 255,
    }),
    stripeCheckoutSessionUrl: text('stripe_checkout_session_url'),
    status: subscriptionCheckoutAttemptStatusEnum('status')
      .notNull()
      .default('pending'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('subscription_checkout_attempts_store_pending_uidx')
      .on(table.storeId)
      .where(sql`${table.status} = 'pending'`),
    uniqueIndex('subscription_checkout_attempts_stripe_session_uidx').on(
      table.stripeCheckoutSessionId,
    ),
    index('subscription_checkout_attempts_store_id_idx').on(table.storeId),
    index('subscription_checkout_attempts_plan_price_id_idx').on(
      table.planPriceId,
    ),
    index('subscription_checkout_attempts_pending_expiry_idx').on(
      table.status,
      table.expiresAt,
    ),
    check(
      'subscription_checkout_attempts_session_fields_check',
      sql`(${table.stripeCheckoutSessionId} IS NULL) = (${table.stripeCheckoutSessionUrl} IS NULL)`,
    ),
    check(
      'subscription_checkout_attempts_expiry_after_creation_check',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id')
      .notNull()
      .references(() => store.id, { onDelete: 'restrict' }),
    planPriceId: uuid('plan_price_id')
      .notNull()
      .references(() => planPrices.id, { onDelete: 'restrict' }),
    stripeSubscriptionId: varchar('stripe_subscription_id', {
      length: 255,
    }).notNull(),
    stripeSubscriptionItemId: varchar('stripe_subscription_item_id', {
      length: 255,
    }),
    status: subscriptionStatusEnum('status')
      .$type<SubscriptionStatus>()
      .notNull(),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    cancelAt: timestamp('cancel_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('subscriptions_stripe_subscription_id_uidx').on(
      table.stripeSubscriptionId,
    ),
    uniqueIndex('subscriptions_stripe_subscription_item_id_uidx').on(
      table.stripeSubscriptionItemId,
    ),
    uniqueIndex('subscriptions_store_non_terminal_uidx')
      .on(table.storeId)
      .where(sql`${table.status} NOT IN ('incomplete_expired', 'canceled')`),
    index('subscriptions_store_id_idx').on(table.storeId),
    index('subscriptions_plan_price_id_idx').on(table.planPriceId),
    check(
      'subscriptions_current_period_order_check',
      sql`${table.currentPeriodStart} IS NULL OR ${table.currentPeriodEnd} IS NULL OR ${table.currentPeriodEnd} > ${table.currentPeriodStart}`,
    ),
  ],
);

export const billingCustomersRelations = relations(
  billingCustomers,
  ({ one }) => ({
    store: one(store, {
      fields: [billingCustomers.storeId],
      references: [store.id],
    }),
  }),
);

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  store: one(store, {
    fields: [subscriptions.storeId],
    references: [store.id],
  }),
  planPrice: one(planPrices, {
    fields: [subscriptions.planPriceId],
    references: [planPrices.id],
  }),
}));

export const subscriptionCheckoutAttemptsRelations = relations(
  subscriptionCheckoutAttempts,
  ({ one }) => ({
    store: one(store, {
      fields: [subscriptionCheckoutAttempts.storeId],
      references: [store.id],
    }),
    planPrice: one(planPrices, {
      fields: [subscriptionCheckoutAttempts.planPriceId],
      references: [planPrices.id],
    }),
  }),
);
