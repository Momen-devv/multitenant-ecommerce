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

export const paymentEnvironmentEnum = pgEnum('payment_environment', [
  'sandbox',
  'live',
]);

export const storePaymentAccountCreationStatusEnum = pgEnum(
  'store_payment_account_creation_status',
  ['not_started', 'creating', 'created', 'review_required'],
);

export const connectWebhookEventStatusEnum = pgEnum(
  'connect_webhook_event_status',
  ['pending', 'processing', 'completed', 'failed', 'dead_letter'],
);

export const storePaymentAccounts = pgTable(
  'store_payment_accounts',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id')
      .notNull()
      .references(() => store.id, { onDelete: 'restrict' }),
    environment: paymentEnvironmentEnum('environment').notNull(),
    accountId: varchar('account_id', { length: 255 }),
    creationStatus: storePaymentAccountCreationStatusEnum('creation_status')
      .notNull()
      .default('not_started'),
    frozenCreationRequest: jsonb('frozen_creation_request')
      .$type<Record<string, unknown>>()
      .notNull(),
    creationProviderKey: varchar('creation_provider_key', {
      length: 255,
    }).notNull(),
    creationDispatchedAt: timestamp('creation_dispatched_at', {
      withTimezone: true,
    }),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    retryCount: integer('retry_count').notNull().default(0),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: varchar('last_error', { length: 1000 }),
    chargesEnabled: boolean('charges_enabled').notNull().default(false),
    payoutsEnabled: boolean('payouts_enabled').notNull().default(false),
    cardPaymentsActive: boolean('card_payments_active')
      .notNull()
      .default(false),
    detailsSubmitted: boolean('details_submitted').notNull().default(false),
    requirementsDue: text('requirements_due').array().notNull().default([]),
    disabledReason: varchar('disabled_reason', { length: 255 }),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    deauthorizedAt: timestamp('deauthorized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('store_payment_accounts_store_environment_uidx').on(
      table.storeId,
      table.environment,
    ),
    uniqueIndex('store_payment_accounts_environment_account_uidx')
      .on(table.environment, table.accountId)
      .where(sql`${table.accountId} IS NOT NULL`),
    index('store_payment_accounts_creation_due_idx').on(
      table.creationStatus,
      table.nextRetryAt,
    ),
    index('store_payment_accounts_lease_idx').on(
      table.creationStatus,
      table.leaseExpiresAt,
    ),
    check(
      'store_payment_accounts_creation_lease_check',
      sql`(${table.creationStatus} = 'creating') = (${table.leaseToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL)`,
    ),
    check(
      'store_payment_accounts_created_requires_account_check',
      sql`${table.creationStatus} IN ('not_started', 'creating', 'review_required') OR ${table.accountId} IS NOT NULL`,
    ),
    check(
      'store_payment_accounts_retry_count_nonnegative_check',
      sql`${table.retryCount} >= 0`,
    ),
  ],
);

export const connectWebhookEvents = pgTable(
  'connect_webhook_events',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    environment: paymentEnvironmentEnum('environment').notNull(),
    accountId: varchar('account_id', { length: 255 }).notNull(),
    stripeEventId: varchar('stripe_event_id', { length: 255 }).notNull(),
    eventType: varchar('event_type', { length: 255 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: connectWebhookEventStatusEnum('status')
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: varchar('last_error', { length: 1000 }),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    uniqueIndex('connect_webhook_events_environment_event_uidx').on(
      table.environment,
      table.stripeEventId,
    ),
    uniqueIndex('connect_webhook_events_environment_account_event_uidx').on(
      table.environment,
      table.accountId,
      table.stripeEventId,
    ),
    index('connect_webhook_events_due_idx').on(table.status, table.nextRetryAt),
    index('connect_webhook_events_lease_idx').on(
      table.status,
      table.leaseExpiresAt,
    ),
    check(
      'connect_webhook_events_processing_lease_check',
      sql`(${table.status} = 'processing') = (${table.leaseToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL)`,
    ),
    check(
      'connect_webhook_events_attempts_nonnegative_check',
      sql`${table.attempts} >= 0`,
    ),
  ],
);

export const storePaymentAccountsRelations = relations(
  storePaymentAccounts,
  ({ one }) => ({
    store: one(store, {
      fields: [storePaymentAccounts.storeId],
      references: [store.id],
    }),
  }),
);
