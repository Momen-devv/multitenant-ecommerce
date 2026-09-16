import { generateUUIDv7 } from '@/common/utils';
import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { store } from './app.schema';
import { productVariants } from './products.schema';

/** A current, non-empty selection for one shopper and one Store. */
export const carts = pgTable(
  'carts',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => store.id, { onDelete: 'restrict' }),
    // Assigned by cart_version_sequence, never by incrementing a row value.
    version: bigint('version', { mode: 'number' }).notNull(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('carts_user_store_uidx').on(table.userId, table.storeId),
    unique('carts_store_id_id_unique').on(table.storeId, table.id),
    index('carts_last_activity_idx').on(table.lastActivityAt),
    check('carts_version_positive_check', sql`${table.version} > 0`),
  ],
);

export const cartItems = pgTable(
  'cart_items',
  {
    cartId: uuid('cart_id').notNull(),
    storeId: uuid('store_id').notNull(),
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
    unique('cart_items_cart_variant_uidx').on(table.cartId, table.variantId),
    foreignKey({
      name: 'cart_items_cart_store_fk',
      columns: [table.storeId, table.cartId],
      foreignColumns: [carts.storeId, carts.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'cart_items_store_variant_fk',
      columns: [table.storeId, table.variantId],
      foreignColumns: [productVariants.storeId, productVariants.id],
    }).onDelete('restrict'),
    check(
      'cart_items_quantity_range_check',
      sql`${table.quantity} BETWEEN 1 AND 99`,
    ),
  ],
);

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(user, { fields: [carts.userId], references: [user.id] }),
  store: one(store, { fields: [carts.storeId], references: [store.id] }),
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, {
    fields: [cartItems.storeId, cartItems.cartId],
    references: [carts.storeId, carts.id],
  }),
  variant: one(productVariants, {
    fields: [cartItems.storeId, cartItems.variantId],
    references: [productVariants.storeId, productVariants.id],
  }),
}));
