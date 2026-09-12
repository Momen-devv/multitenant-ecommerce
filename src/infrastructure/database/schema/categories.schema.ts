import { CategoryStatus } from '@/common/enums';
import { generateUUIDv7 } from '@/common/utils';
import { relations, sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { store } from './app.schema';
import { products } from './products.schema';

export const categoryStatus = pgEnum('category_status', [
  CategoryStatus.DRAFT,
  CategoryStatus.PUBLISHED,
  CategoryStatus.ARCHIVED,
]);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id')
      .notNull()
      .references(() => store.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 200 }).notNull(),
    description: text('description'),
    status: categoryStatus('status').notNull().default(CategoryStatus.DRAFT),
    position: integer('position').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('categories_store_id_id_unique').on(table.storeId, table.id),
    uniqueIndex('categories_store_slug_uidx').on(table.storeId, table.slug),
    index('categories_store_status_position_idx').on(
      table.storeId,
      table.status,
      table.position,
      table.id,
    ),
    check(
      'categories_name_normalized_check',
      sql`${table.name} = trim(${table.name}) AND char_length(${table.name}) BETWEEN 1 AND 200`,
    ),
    check(
      'categories_slug_format_check',
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
    check(
      'categories_description_normalized_check',
      sql`${table.description} IS NULL OR (${table.description} = trim(${table.description}) AND char_length(${table.description}) BETWEEN 1 AND 50000)`,
    ),
    check('categories_position_nonnegative_check', sql`${table.position} >= 0`),
    check('categories_version_positive_check', sql`${table.version} > 0`),
    check(
      'categories_lifecycle_timestamps_check',
      sql`(${table.status} = 'draft' AND ${table.publishedAt} IS NULL AND ${table.archivedAt} IS NULL)
        OR (${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL AND ${table.archivedAt} IS NULL)
        OR (${table.status} = 'archived' AND ${table.archivedAt} IS NOT NULL)`,
    ),
  ],
);

export const productCategories = pgTable(
  'product_categories',
  {
    storeId: uuid('store_id').notNull(),
    productId: uuid('product_id').notNull(),
    categoryId: uuid('category_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'product_categories_pk',
      columns: [table.storeId, table.productId, table.categoryId],
    }),
    foreignKey({
      name: 'product_categories_store_product_fk',
      columns: [table.storeId, table.productId],
      foreignColumns: [products.storeId, products.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'product_categories_store_category_fk',
      columns: [table.storeId, table.categoryId],
      foreignColumns: [categories.storeId, categories.id],
    }).onDelete('restrict'),
    index('product_categories_category_product_idx').on(
      table.categoryId,
      table.productId,
    ),
  ],
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  store: one(store, {
    fields: [categories.storeId],
    references: [store.id],
  }),
  memberships: many(productCategories),
}));

export const productCategoriesRelations = relations(
  productCategories,
  ({ one }) => ({
    category: one(categories, {
      fields: [productCategories.storeId, productCategories.categoryId],
      references: [categories.storeId, categories.id],
    }),
    product: one(products, {
      fields: [productCategories.storeId, productCategories.productId],
      references: [products.storeId, products.id],
    }),
  }),
);
