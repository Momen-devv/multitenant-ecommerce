import { generateUUIDv7 } from '@/common/utils';
import {
  MAX_CART_ITEM_QUANTITY,
  MAX_ORDER_TOTAL_MINOR_UNITS,
  MAX_UNIT_PRICE_MINOR_UNITS,
} from '@/common/commerce/limits';
import {
  CartState,
  InventoryPolicy,
  OrderEventActorAuthority,
  OrderPaymentMethod,
  OrderStatus,
} from '@/common/enums';
import type { OrderedOptionSnapshot } from '@/modules/orders/contracts';
import { relations, sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
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
import { store } from './app.schema';
import { productVariants } from './products.schema';

const maxOrderTotalSql = sql.raw(String(MAX_ORDER_TOTAL_MINOR_UNITS));
const maxUnitPriceSql = sql.raw(String(MAX_UNIT_PRICE_MINOR_UNITS));

export const cartState = pgEnum('cart_state', [
  CartState.ACTIVE,
  CartState.CONVERTED,
]);
export const orderStatus = pgEnum('order_status', [
  OrderStatus.PLACED,
  OrderStatus.FULFILLED,
  OrderStatus.CANCELLED,
]);
export const orderPaymentMethod = pgEnum('order_payment_method', [
  OrderPaymentMethod.CASH_ON_DELIVERY,
]);
export const orderEventActorAuthority = pgEnum('order_event_actor_authority', [
  OrderEventActorAuthority.GUEST,
  OrderEventActorAuthority.STORE_OWNER,
]);

export const carts = pgTable(
  'carts',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id')
      .notNull()
      .references(() => store.id, { onDelete: 'restrict' }),
    tokenDigest: varchar('token_digest', { length: 64 }).notNull(),
    state: cartState('state').notNull().default(CartState.ACTIVE),
    version: integer('version').notNull().default(1),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('carts_store_id_id_unique').on(table.storeId, table.id),
    uniqueIndex('carts_token_digest_uidx').on(table.tokenDigest),
    index('carts_active_expiry_idx')
      .on(table.expiresAt)
      .where(sql`${table.state} = 'active'`),
    check(
      'carts_token_digest_format_check',
      sql`${table.tokenDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check('carts_version_positive_check', sql`${table.version} > 0`),
    check(
      'carts_expiry_after_creation_check',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      'carts_state_timestamps_check',
      sql`(${table.state} = 'active' AND ${table.convertedAt} IS NULL)
        OR (${table.state} = 'converted' AND ${table.convertedAt} IS NOT NULL)`,
    ),
  ],
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id').notNull(),
    cartId: uuid('cart_id').notNull(),
    productId: uuid('product_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'cart_items_store_cart_fk',
      columns: [table.storeId, table.cartId],
      foreignColumns: [carts.storeId, carts.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'cart_items_store_product_variant_fk',
      columns: [table.storeId, table.productId, table.variantId],
      foreignColumns: [
        productVariants.storeId,
        productVariants.productId,
        productVariants.id,
      ],
    }).onDelete('restrict'),
    uniqueIndex('cart_items_cart_variant_uidx').on(
      table.cartId,
      table.variantId,
    ),
    index('cart_items_store_cart_idx').on(table.storeId, table.cartId),
    check(
      'cart_items_quantity_check',
      sql`${table.quantity} BETWEEN 1 AND ${sql.raw(String(MAX_CART_ITEM_QUANTITY))}`,
    ),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id').notNull(),
    sourceCartId: uuid('source_cart_id').notNull(),
    status: orderStatus('status').notNull().default(OrderStatus.PLACED),
    currency: varchar('currency', { length: 3 }).notNull(),
    subtotal: integer('subtotal').notNull(),
    shippingAmount: integer('shipping_amount').notNull().default(0),
    taxAmount: integer('tax_amount').notNull().default(0),
    total: integer('total').notNull(),
    paymentMethod: orderPaymentMethod('payment_method')
      .notNull()
      .default(OrderPaymentMethod.CASH_ON_DELIVERY),
    recipientName: varchar('recipient_name', { length: 200 }).notNull(),
    email: varchar('email', { length: 254 }).notNull(),
    phone: varchar('phone', { length: 50 }).notNull(),
    addressLine1: varchar('address_line_1', { length: 200 }).notNull(),
    addressLine2: varchar('address_line_2', { length: 200 }),
    city: varchar('city', { length: 100 }).notNull(),
    region: varchar('region', { length: 100 }),
    postalCode: varchar('postal_code', { length: 32 }),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    checkoutIdempotencyKey: varchar('checkout_idempotency_key', {
      length: 255,
    }).notNull(),
    checkoutRequestFingerprint: varchar('checkout_request_fingerprint', {
      length: 128,
    }).notNull(),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull(),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'orders_store_source_cart_fk',
      columns: [table.storeId, table.sourceCartId],
      foreignColumns: [carts.storeId, carts.id],
    }).onDelete('restrict'),
    unique('orders_store_id_id_unique').on(table.storeId, table.id),
    uniqueIndex('orders_source_cart_uidx').on(table.sourceCartId),
    uniqueIndex('orders_source_cart_idempotency_uidx').on(
      table.sourceCartId,
      table.checkoutIdempotencyKey,
    ),
    index('orders_store_status_placed_id_idx').on(
      table.storeId,
      table.status,
      table.placedAt,
      table.id,
    ),
    check(
      'orders_currency_format_check',
      sql`${table.currency} ~ '^[a-z]{3}$'`,
    ),
    check(
      'orders_amounts_check',
      sql`${table.subtotal} >= 0 AND ${table.shippingAmount} >= 0 AND ${table.taxAmount} >= 0
        AND ${table.subtotal} <= ${maxOrderTotalSql}
        AND ${table.shippingAmount} <= ${maxOrderTotalSql}
        AND ${table.taxAmount} <= ${maxOrderTotalSql}
        AND ${table.total} = (${table.subtotal}::bigint + ${table.shippingAmount}::bigint + ${table.taxAmount}::bigint)
        AND ${table.total} <= ${maxOrderTotalSql}`,
    ),
    check(
      'orders_recipient_name_check',
      sql`${table.recipientName} = trim(${table.recipientName}) AND char_length(${table.recipientName}) BETWEEN 1 AND 200`,
    ),
    check(
      'orders_email_check',
      sql`${table.email} = trim(${table.email}) AND char_length(${table.email}) BETWEEN 3 AND 254`,
    ),
    check(
      'orders_phone_check',
      sql`${table.phone} = trim(${table.phone}) AND char_length(${table.phone}) BETWEEN 3 AND 50`,
    ),
    check(
      'orders_address_line_1_check',
      sql`${table.addressLine1} = trim(${table.addressLine1}) AND char_length(${table.addressLine1}) BETWEEN 1 AND 200`,
    ),
    check(
      'orders_address_line_2_check',
      sql`${table.addressLine2} IS NULL OR (${table.addressLine2} = trim(${table.addressLine2}) AND char_length(${table.addressLine2}) BETWEEN 1 AND 200)`,
    ),
    check(
      'orders_city_check',
      sql`${table.city} = trim(${table.city}) AND char_length(${table.city}) BETWEEN 1 AND 100`,
    ),
    check(
      'orders_region_check',
      sql`${table.region} IS NULL OR (${table.region} = trim(${table.region}) AND char_length(${table.region}) BETWEEN 1 AND 100)`,
    ),
    check(
      'orders_postal_code_check',
      sql`${table.postalCode} IS NULL OR (${table.postalCode} = trim(${table.postalCode}) AND char_length(${table.postalCode}) BETWEEN 1 AND 32)`,
    ),
    check(
      'orders_country_code_check',
      sql`${table.countryCode} ~ '^[A-Z]{2}$'`,
    ),
    check(
      'orders_idempotency_key_check',
      sql`${table.checkoutIdempotencyKey} = trim(${table.checkoutIdempotencyKey}) AND char_length(${table.checkoutIdempotencyKey}) BETWEEN 1 AND 255`,
    ),
    check(
      'orders_fingerprint_check',
      sql`${table.checkoutRequestFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'orders_state_timestamps_check',
      sql`(${table.status} = 'placed' AND ${table.fulfilledAt} IS NULL AND ${table.cancelledAt} IS NULL)
        OR (${table.status} = 'fulfilled' AND ${table.fulfilledAt} IS NOT NULL AND ${table.cancelledAt} IS NULL)
        OR (${table.status} = 'cancelled' AND ${table.cancelledAt} IS NOT NULL AND ${table.fulfilledAt} IS NULL)`,
    ),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id').notNull(),
    orderId: uuid('order_id').notNull(),
    sourceProductId: uuid('source_product_id').notNull(),
    sourceVariantId: uuid('source_variant_id').notNull(),
    productName: varchar('product_name', { length: 200 }).notNull(),
    variantTitle: varchar('variant_title', { length: 200 }).notNull(),
    sku: varchar('sku', { length: 100 }).notNull(),
    orderedOptions: jsonb('ordered_options')
      .$type<ReadonlyArray<OrderedOptionSnapshot>>()
      .notNull(),
    unitPrice: integer('unit_price').notNull(),
    quantity: integer('quantity').notNull(),
    lineTotal: integer('line_total').notNull(),
    inventoryPolicy: text('inventory_policy')
      .$type<InventoryPolicy>()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'order_items_store_order_fk',
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'order_items_store_product_variant_fk',
      columns: [table.storeId, table.sourceProductId, table.sourceVariantId],
      foreignColumns: [
        productVariants.storeId,
        productVariants.productId,
        productVariants.id,
      ],
    }).onDelete('restrict'),
    uniqueIndex('order_items_order_variant_uidx').on(
      table.orderId,
      table.sourceVariantId,
    ),
    index('order_items_store_order_idx').on(table.storeId, table.orderId),
    check(
      'order_items_product_name_check',
      sql`${table.productName} = trim(${table.productName}) AND char_length(${table.productName}) BETWEEN 1 AND 200`,
    ),
    check(
      'order_items_variant_title_check',
      sql`${table.variantTitle} = trim(${table.variantTitle}) AND char_length(${table.variantTitle}) BETWEEN 1 AND 200`,
    ),
    check(
      'order_items_sku_check',
      sql`${table.sku} = trim(${table.sku}) AND char_length(${table.sku}) BETWEEN 1 AND 100`,
    ),
    check(
      'order_items_options_array_check',
      sql`jsonb_typeof(${table.orderedOptions}) = 'array'`,
    ),
    check(
      'order_items_unit_price_check',
      sql`${table.unitPrice} BETWEEN 1 AND ${maxUnitPriceSql}`,
    ),
    check(
      'order_items_quantity_check',
      sql`${table.quantity} BETWEEN 1 AND ${sql.raw(String(MAX_CART_ITEM_QUANTITY))}`,
    ),
    check(
      'order_items_line_total_check',
      sql`${table.lineTotal} = ${table.unitPrice} * ${table.quantity} AND ${table.lineTotal} <= ${maxOrderTotalSql}`,
    ),
    check(
      'order_items_inventory_policy_check',
      sql`${table.inventoryPolicy} IN ('tracked', 'untracked')`,
    ),
    check(
      'order_items_options_shape_check',
      sql`NOT jsonb_path_exists(${table.orderedOptions}, '$[*] ? (!exists(@.name) || !exists(@.value) || @.name.type() != "string" || @.value.type() != "string" || @.name == "" || @.value == "")')`,
    ),
  ],
);

export const orderEvents = pgTable(
  'order_events',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id').notNull(),
    orderId: uuid('order_id').notNull(),
    transition: orderStatus('transition').notNull(),
    actorId: text('actor_id'),
    actorAuthority: orderEventActorAuthority('actor_authority').notNull(),
    reason: varchar('reason', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'order_events_store_order_fk',
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id],
    }).onDelete('restrict'),
    index('order_events_store_order_created_idx').on(
      table.storeId,
      table.orderId,
      table.createdAt,
    ),
    check(
      'order_events_actor_check',
      sql`(${table.transition} = 'placed' AND ${table.actorAuthority} = 'guest' AND ${table.actorId} IS NULL AND ${table.reason} IS NULL)
        OR (${table.transition} = 'fulfilled' AND ${table.actorAuthority} = 'store_owner' AND ${table.actorId} IS NOT NULL AND ${table.reason} IS NULL)
        OR (${table.transition} = 'cancelled' AND ${table.actorAuthority} = 'store_owner' AND ${table.actorId} IS NOT NULL AND ${table.reason} = trim(${table.reason}) AND char_length(${table.reason}) BETWEEN 1 AND 500)`,
    ),
  ],
);

export const cartsRelations = relations(carts, ({ one, many }) => ({
  store: one(store, { fields: [carts.storeId], references: [store.id] }),
  items: many(cartItems),
  order: one(orders),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, {
    fields: [cartItems.storeId, cartItems.cartId],
    references: [carts.storeId, carts.id],
  }),
  variant: one(productVariants, {
    fields: [cartItems.storeId, cartItems.productId, cartItems.variantId],
    references: [
      productVariants.storeId,
      productVariants.productId,
      productVariants.id,
    ],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  cart: one(carts, {
    fields: [orders.storeId, orders.sourceCartId],
    references: [carts.storeId, carts.id],
  }),
  items: many(orderItems),
  events: many(orderEvents),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.storeId, orderItems.orderId],
    references: [orders.storeId, orders.id],
  }),
  variant: one(productVariants, {
    fields: [
      orderItems.storeId,
      orderItems.sourceProductId,
      orderItems.sourceVariantId,
    ],
    references: [
      productVariants.storeId,
      productVariants.productId,
      productVariants.id,
    ],
  }),
}));

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, {
    fields: [orderEvents.storeId, orderEvents.orderId],
    references: [orders.storeId, orders.id],
  }),
}));
