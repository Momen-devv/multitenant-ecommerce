import { generateUUIDv7 } from '@/common/utils';
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
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { store } from './app.schema';
import { carts } from './carts.schema';
import { inventoryPolicy } from './products.schema';
import { paymentEnvironmentEnum } from './store-payments.schema';

export const checkoutPaymentMethod = pgEnum('checkout_payment_method', [
  'cash_on_delivery',
  'online',
]);
export const checkoutAttemptStatus = pgEnum('checkout_attempt_status', [
  'creating',
  'pending',
  'cancelling',
  'succeeded',
  'expired',
  'cancelled',
  'failed',
]);
export const orderStatus = pgEnum('order_status', [
  'placed',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
]);
export const orderPaymentStatus = pgEnum('order_payment_status', [
  'unpaid',
  'paid',
  'refund_pending',
  'refunded',
  'refund_failed',
]);
export const reservationDisposition = pgEnum(
  'checkout_reservation_disposition',
  ['held', 'released', 'consumed', 'returned'],
);

export type CheckoutSnapshot = {
  cartId: string;
  cartVersion: number;
  items: Array<{
    variantId: string;
    productId: string;
    name: string;
    variantTitle: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    inventoryPolicy: 'tracked' | 'untracked';
  }>;
  subtotal: number;
  shippingFee: number;
  total: number;
  currency: 'usd';
  paymentMethod: 'cash_on_delivery' | 'online';
  accountContact: { email: string; phoneNumber: string };
  shippingAddress: {
    recipientName: string;
    recipientPhone: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    countryCode: string;
  };
  shippingPolicy: string | null;
};

export const checkoutQuotes = pgTable(
  'checkout_quotes',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => store.id, { onDelete: 'restrict' }),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    cartVersion: integer('cart_version').notNull(),
    snapshot: jsonb('snapshot').$type<CheckoutSnapshot>().notNull(),
    snapshotHash: varchar('snapshot_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('checkout_quotes_expiry_idx').on(t.expiresAt),
    check('checkout_quotes_version_check', sql`${t.cartVersion} > 0`),
  ],
);

export const checkoutAttempts = pgTable(
  'checkout_attempts',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => store.id, { onDelete: 'restrict' }),
    cartId: uuid('cart_id').references(() => carts.id, {
      onDelete: 'set null',
    }),
    quoteId: uuid('quote_id').references(() => checkoutQuotes.id, {
      onDelete: 'set null',
    }),
    quoteReferenceId: uuid('quote_reference_id').notNull(),
    paymentMethod: checkoutPaymentMethod('payment_method').notNull(),
    status: checkoutAttemptStatus('status').notNull(),
    snapshot: jsonb('snapshot').$type<CheckoutSnapshot>().notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    paymentUrl: text('payment_url'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    connectedAccountId: varchar('connected_account_id', { length: 255 }),
    paymentEnvironment: paymentEnvironmentEnum('payment_environment'),
    checkoutSessionId: varchar('checkout_session_id', { length: 255 }),
    paymentIntentId: varchar('payment_intent_id', { length: 255 }),
    providerRequestKey: varchar('provider_request_key', { length: 255 }),
    providerRequest: jsonb('provider_request').$type<Record<string, unknown>>(),
    providerDispatchedAt: timestamp('provider_dispatched_at', {
      withTimezone: true,
    }),
    providerAttempts: integer('provider_attempts').notNull().default(0),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    lastProviderError: varchar('last_provider_error', { length: 1000 }),
    paymentReviewRequired: boolean('payment_review_required')
      .notNull()
      .default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('checkout_attempts_quote_uidx').on(t.quoteReferenceId),
    uniqueIndex('checkout_attempts_active_cart_uidx')
      .on(t.cartId)
      .where(sql`${t.status} IN ('creating', 'pending', 'cancelling')`),
    uniqueIndex('checkout_attempts_actor_key_uidx').on(
      t.userId,
      t.idempotencyKey,
    ),
    uniqueIndex('checkout_attempts_session_uidx')
      .on(t.paymentEnvironment, t.connectedAccountId, t.checkoutSessionId)
      .where(sql`${t.checkoutSessionId} IS NOT NULL`),
    uniqueIndex('checkout_attempts_payment_intent_uidx')
      .on(t.paymentEnvironment, t.connectedAccountId, t.paymentIntentId)
      .where(sql`${t.paymentIntentId} IS NOT NULL`),
    index('checkout_attempts_recovery_due_idx').on(t.status, t.nextRetryAt),
    index('checkout_attempts_lease_idx').on(t.status, t.leaseExpiresAt),
    index('checkout_attempts_user_created_idx').on(t.userId, t.createdAt, t.id),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => checkoutAttempts.id, { onDelete: 'restrict' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => store.id, { onDelete: 'restrict' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    status: orderStatus('status').notNull().default('placed'),
    paymentMethod: checkoutPaymentMethod('payment_method').notNull(),
    paymentStatus: orderPaymentStatus('payment_status').notNull(),
    version: integer('version').notNull().default(1),
    currency: varchar('currency', { length: 3 }).notNull().default('usd'),
    subtotal: integer('subtotal').notNull(),
    shippingFee: integer('shipping_fee').notNull(),
    total: integer('total').notNull(),
    refundedAmount: integer('refunded_amount').notNull().default(0),
    accountEmail: text('account_email').notNull(),
    accountPhone: text('account_phone').notNull(),
    shippingAddress: jsonb('shipping_address')
      .$type<CheckoutSnapshot['shippingAddress']>()
      .notNull(),
    shippingPolicy: text('shipping_policy'),
    carrier: varchar('carrier', { length: 100 }),
    trackingNumber: varchar('tracking_number', { length: 200 }),
    cancellationReason: text('cancellation_reason'),
    preparedAt: timestamp('prepared_at', { withTimezone: true }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    paymentReviewRequired: boolean('payment_review_required')
      .notNull()
      .default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('orders_attempt_uidx').on(t.attemptId),
    index('orders_user_created_idx').on(t.userId, t.createdAt, t.id),
    index('orders_store_status_created_idx').on(
      t.storeId,
      t.status,
      t.createdAt,
      t.id,
    ),
    check(
      'orders_amounts_check',
      sql`${t.subtotal} >= 0 AND ${t.shippingFee} >= 0 AND ${t.total} = ${t.subtotal} + ${t.shippingFee} AND ${t.refundedAmount} >= 0`,
    ),
    check(
      'orders_carrier_tracking_pair_check',
      sql`(${t.carrier} IS NULL AND ${t.trackingNumber} IS NULL) OR (${t.carrier} IS NOT NULL AND ${t.trackingNumber} IS NOT NULL)`,
    ),
    check(
      'orders_cancellation_reason_check',
      sql`${t.cancellationReason} IS NULL OR (${t.cancellationReason} = trim(${t.cancellationReason}) AND char_length(${t.cancellationReason}) BETWEEN 1 AND 500)`,
    ),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    storeId: uuid('store_id').notNull(),
    productId: uuid('product_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    name: text('name').notNull(),
    variantTitle: text('variant_title').notNull(),
    sku: text('sku').notNull(),
    unitPrice: integer('unit_price').notNull(),
    quantity: integer('quantity').notNull(),
    lineTotal: integer('line_total').notNull(),
    inventoryPolicy: inventoryPolicy('inventory_policy').notNull(),
  },
  (t) => [
    unique('order_items_order_variant_uidx').on(t.orderId, t.variantId),
    check(
      'order_items_amount_check',
      sql`${t.quantity} BETWEEN 1 AND 99 AND ${t.unitPrice} >= 0 AND ${t.lineTotal} = ${t.unitPrice} * ${t.quantity}`,
    ),
  ],
);

export const checkoutReservations = pgTable(
  'checkout_reservations',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => checkoutAttempts.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id').references(() => orders.id, {
      onDelete: 'restrict',
    }),
    storeId: uuid('store_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    quantity: integer('quantity').notNull(),
    inventoryPolicy: inventoryPolicy('inventory_policy').notNull(),
    disposition: reservationDisposition('disposition')
      .notNull()
      .default('held'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('checkout_reservations_attempt_variant_uidx').on(
      t.attemptId,
      t.variantId,
    ),
    index('checkout_reservations_variant_disposition_idx').on(
      t.variantId,
      t.disposition,
    ),
    check(
      'checkout_reservations_quantity_check',
      sql`${t.quantity} BETWEEN 1 AND 99`,
    ),
  ],
);

export const orderEvents = pgTable(
  'order_events',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    storeId: uuid('store_id').notNull(),
    version: integer('version').notNull(),
    kind: varchar('kind', { length: 64 }).notNull(),
    previousStatus: orderStatus('previous_status'),
    nextStatus: orderStatus('next_status'),
    actorAuthority: varchar('actor_authority', { length: 32 }),
    actorUserId: text('actor_user_id'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('order_events_order_version_uidx').on(t.orderId, t.version),
    check(
      'order_events_reason_check',
      sql`${t.reason} IS NULL OR (${t.reason} = trim(${t.reason}) AND char_length(${t.reason}) BETWEEN 1 AND 500)`,
    ),
  ],
);

export const commerceCommands = pgTable(
  'commerce_commands',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    actorUserId: text('actor_user_id').notNull(),
    operation: varchar('operation', { length: 64 }).notNull(),
    resourceId: uuid('resource_id').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    attemptId: uuid('attempt_id').references(() => checkoutAttempts.id, {
      onDelete: 'restrict',
    }),
    orderId: uuid('order_id').references(() => orders.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('commerce_commands_actor_operation_resource_key_uidx').on(
      t.actorUserId,
      t.operation,
      t.resourceId,
      t.idempotencyKey,
    ),
  ],
);

export const checkoutQuotesRelations = relations(checkoutQuotes, ({ one }) => ({
  cart: one(carts, { fields: [checkoutQuotes.cartId], references: [carts.id] }),
}));
