import { relations, sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '@/common/utils';
import { user } from './auth.schema';
import { products } from './products.schema';

export const productComments = pgTable(
  'product_comments',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id').notNull(),
    productId: uuid('product_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'product_comments_store_product_fk',
      columns: [table.storeId, table.productId],
      foreignColumns: [products.storeId, products.id],
    }).onDelete('cascade'),
    uniqueIndex('product_comments_product_user_uidx').on(
      table.productId,
      table.userId,
    ),
    index('product_comments_product_created_id_idx').on(
      table.productId,
      table.createdAt,
      table.id,
    ),
    check(
      'product_comments_content_check',
      sql`${table.content} = trim(${table.content}) AND char_length(${table.content}) BETWEEN 1 AND 2000`,
    ),
    check('product_comments_version_check', sql`${table.version} > 0`),
  ],
);

export type CommentCreateResponse = {
  id: string;
  productId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export const commentCreateRequests = pgTable(
  'comment_create_requests',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    response: jsonb('response').$type<CommentCreateResponse>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'comment_create_requests_pk',
      columns: [table.userId, table.idempotencyKey],
    }),
  ],
);

export const productCommentsRelations = relations(
  productComments,
  ({ one }) => ({
    product: one(products, {
      fields: [productComments.productId],
      references: [products.id],
    }),
    author: one(user, {
      fields: [productComments.userId],
      references: [user.id],
    }),
  }),
);
