import { generateUUIDv7 } from '@/common/utils';
import {
  InventoryPolicy,
  ProductStatus,
  ProductVariantStatus,
} from '@/common/enums';
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

export const productStatus = pgEnum('product_status', [
  ProductStatus.DRAFT,
  ProductStatus.PUBLISHED,
  ProductStatus.ARCHIVED,
]);

export const productVariantStatus = pgEnum('product_variant_status', [
  ProductVariantStatus.ACTIVE,
  ProductVariantStatus.ARCHIVED,
]);

export const inventoryPolicy = pgEnum('inventory_policy', [
  InventoryPolicy.TRACKED,
  InventoryPolicy.UNTRACKED,
]);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id')
      .notNull()
      .references(() => store.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 200 }).notNull(),
    description: text('description'),
    status: productStatus('status').notNull().default(ProductStatus.DRAFT),
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
    unique('products_store_id_id_unique').on(table.storeId, table.id),
    uniqueIndex('products_store_slug_uidx').on(table.storeId, table.slug),
    index('products_store_status_created_id_idx').on(
      table.storeId,
      table.status,
      table.createdAt,
      table.id,
    ),
    index('products_store_status_updated_id_idx').on(
      table.storeId,
      table.status,
      table.updatedAt,
      table.id,
    ),
    index('products_name_trgm_idx').using(
      'gin',
      table.name.asc().op('gin_trgm_ops'),
    ),
    check(
      'products_name_normalized_check',
      sql`${table.name} = trim(${table.name}) AND char_length(${table.name}) BETWEEN 1 AND 200`,
    ),
    check(
      'products_slug_format_check',
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
    check(
      'products_description_normalized_check',
      sql`${table.description} IS NULL OR (${table.description} = trim(${table.description}) AND char_length(${table.description}) BETWEEN 1 AND 50000)`,
    ),
    check('products_version_positive_check', sql`${table.version} > 0`),
    check(
      'products_lifecycle_timestamps_check',
      sql`(${table.status} = 'draft' AND ${table.publishedAt} IS NULL AND ${table.archivedAt} IS NULL)
        OR (${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL AND ${table.archivedAt} IS NULL)
        OR (${table.status} = 'archived' AND ${table.archivedAt} IS NOT NULL)`,
    ),
  ],
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id').notNull(),
    productId: uuid('product_id').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    optionSignature: text('option_signature').notNull().default(''),
    sku: varchar('sku', { length: 100 }).notNull(),
    barcode: varchar('barcode', { length: 100 }).notNull(),
    price: integer('price').notNull(),
    compareAtPrice: integer('compare_at_price'),
    weightGrams: integer('weight_grams'),
    status: productVariantStatus('status')
      .notNull()
      .default(ProductVariantStatus.ACTIVE),
    inventoryPolicy: inventoryPolicy('inventory_policy')
      .notNull()
      .default(InventoryPolicy.TRACKED),
    onHand: integer('on_hand').default(0),
    reserved: integer('reserved').default(0),
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
    foreignKey({
      name: 'product_variants_store_product_fk',
      columns: [table.storeId, table.productId],
      foreignColumns: [products.storeId, products.id],
    }).onDelete('restrict'),
    unique('product_variants_store_product_id_unique').on(
      table.storeId,
      table.productId,
      table.id,
    ),
    uniqueIndex('product_variants_product_signature_uidx')
      .on(table.productId, table.optionSignature)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex('product_variants_store_sku_uidx')
      .on(table.storeId, sql`lower(${table.sku})`)
      .where(sql`${table.sku} IS NOT NULL`),
    uniqueIndex('product_variants_store_barcode_uidx')
      .on(table.storeId, sql`lower(${table.barcode})`)
      .where(sql`${table.barcode} IS NOT NULL`),
    index('product_variants_product_status_idx').on(
      table.productId,
      table.status,
    ),
    check(
      'product_variants_title_normalized_check',
      sql`${table.title} = trim(${table.title}) AND char_length(${table.title}) BETWEEN 1 AND 200`,
    ),
    check(
      'product_variants_signature_normalized_check',
      sql`${table.optionSignature} = trim(${table.optionSignature})`,
    ),
    check(
      'product_variants_sku_normalized_check',
      sql`${table.sku} IS NULL OR (${table.sku} = trim(${table.sku}) AND char_length(${table.sku}) BETWEEN 1 AND 100)`,
    ),
    check(
      'product_variants_barcode_normalized_check',
      sql`${table.barcode} IS NULL OR (${table.barcode} = trim(${table.barcode}) AND char_length(${table.barcode}) BETWEEN 1 AND 100)`,
    ),
    check('product_variants_price_positive_check', sql`${table.price} > 0`),
    check(
      'product_variants_compare_at_price_check',
      sql`${table.compareAtPrice} IS NULL OR ${table.compareAtPrice} > ${table.price}`,
    ),
    check(
      'product_variants_weight_nonnegative_check',
      sql`${table.weightGrams} IS NULL OR ${table.weightGrams} >= 0`,
    ),
    check(
      'product_variants_inventory_state_check',
      sql`(${table.inventoryPolicy} = 'tracked' AND ${table.onHand} IS NOT NULL AND ${table.reserved} IS NOT NULL AND ${table.onHand} >= 0 AND ${table.reserved} >= 0 AND ${table.reserved} <= ${table.onHand})
        OR (${table.inventoryPolicy} = 'untracked' AND ${table.onHand} IS NULL AND ${table.reserved} IS NULL)`,
    ),
    check(
      'product_variants_lifecycle_check',
      sql`(${table.status} = 'active' AND ${table.archivedAt} IS NULL)
        OR (${table.status} = 'archived' AND ${table.archivedAt} IS NOT NULL)`,
    ),
    check('product_variants_version_positive_check', sql`${table.version} > 0`),
  ],
);

export const productOptions = pgTable(
  'product_options',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id').notNull(),
    productId: uuid('product_id').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'product_options_store_product_fk',
      columns: [table.storeId, table.productId],
      foreignColumns: [products.storeId, products.id],
    }).onDelete('restrict'),
    unique('product_options_store_product_id_unique').on(
      table.storeId,
      table.productId,
      table.id,
    ),
    uniqueIndex('product_options_product_name_uidx').on(
      table.productId,
      sql`lower(${table.name})`,
    ),
    uniqueIndex('product_options_product_position_uidx').on(
      table.productId,
      table.position,
    ),
    check(
      'product_options_name_normalized_check',
      sql`${table.name} = trim(${table.name}) AND char_length(${table.name}) BETWEEN 1 AND 100`,
    ),
    check(
      'product_options_position_check',
      sql`${table.position} BETWEEN 0 AND 2`,
    ),
  ],
);

export const productOptionValues = pgTable(
  'product_option_values',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id').notNull(),
    productId: uuid('product_id').notNull(),
    optionId: uuid('option_id').notNull(),
    value: varchar('value', { length: 100 }).notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'product_option_values_option_fk',
      columns: [table.storeId, table.productId, table.optionId],
      foreignColumns: [
        productOptions.storeId,
        productOptions.productId,
        productOptions.id,
      ],
    }).onDelete('restrict'),
    unique('product_option_values_store_product_option_id_unique').on(
      table.storeId,
      table.productId,
      table.optionId,
      table.id,
    ),
    uniqueIndex('product_option_values_option_value_uidx').on(
      table.optionId,
      sql`lower(${table.value})`,
    ),
    uniqueIndex('product_option_values_option_position_uidx').on(
      table.optionId,
      table.position,
    ),
    check(
      'product_option_values_value_normalized_check',
      sql`${table.value} = trim(${table.value}) AND char_length(${table.value}) BETWEEN 1 AND 100`,
    ),
    check(
      'product_option_values_position_nonnegative_check',
      sql`${table.position} >= 0`,
    ),
  ],
);

export const productVariantOptionValues = pgTable(
  'product_variant_option_values',
  {
    storeId: uuid('store_id').notNull(),
    productId: uuid('product_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    optionId: uuid('option_id').notNull(),
    optionValueId: uuid('option_value_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'product_variant_option_values_pk',
      columns: [table.variantId, table.optionId],
    }),
    foreignKey({
      name: 'product_variant_option_values_variant_fk',
      columns: [table.storeId, table.productId, table.variantId],
      foreignColumns: [
        productVariants.storeId,
        productVariants.productId,
        productVariants.id,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'product_variant_option_values_value_fk',
      columns: [
        table.storeId,
        table.productId,
        table.optionId,
        table.optionValueId,
      ],
      foreignColumns: [
        productOptionValues.storeId,
        productOptionValues.productId,
        productOptionValues.optionId,
        productOptionValues.id,
      ],
    }).onDelete('restrict'),
    uniqueIndex('product_variant_option_values_variant_value_uidx').on(
      table.variantId,
      table.optionValueId,
    ),
    index('product_variant_option_values_value_id_idx').on(table.optionValueId),
  ],
);

export const productImages = pgTable(
  'product_images',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    storeId: uuid('store_id').notNull(),
    productId: uuid('product_id').notNull(),
    imageKey: text('image_key').notNull(),
    publicUrl: text('public_url'),
    altText: varchar('alt_text', { length: 255 }),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    byteSize: integer('byte_size').notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'product_images_store_product_fk',
      columns: [table.storeId, table.productId],
      foreignColumns: [products.storeId, products.id],
    }).onDelete('restrict'),
    uniqueIndex('product_images_image_key_uidx').on(table.imageKey),
    uniqueIndex('product_images_product_position_uidx').on(
      table.productId,
      table.position,
    ),
    check(
      'product_images_image_key_not_blank_check',
      sql`char_length(trim(${table.imageKey})) > 0`,
    ),
    check(
      'product_images_public_url_not_blank_check',
      sql`${table.publicUrl} IS NULL OR char_length(trim(${table.publicUrl})) > 0`,
    ),
    check(
      'product_images_alt_text_normalized_check',
      sql`${table.altText} IS NULL OR (${table.altText} = trim(${table.altText}) AND char_length(${table.altText}) BETWEEN 1 AND 255)`,
    ),
    check(
      'product_images_dimensions_positive_check',
      sql`${table.width} > 0 AND ${table.height} > 0`,
    ),
    check(
      'product_images_byte_size_positive_check',
      sql`${table.byteSize} > 0`,
    ),
    check(
      'product_images_mime_type_check',
      sql`${table.mimeType} IN ('image/jpeg', 'image/png', 'image/webp')`,
    ),
    check(
      'product_images_position_nonnegative_check',
      sql`${table.position} >= 0`,
    ),
  ],
);

export const productsRelations = relations(products, ({ one, many }) => ({
  store: one(store, {
    fields: [products.storeId],
    references: [store.id],
  }),
  variants: many(productVariants),
  options: many(productOptions),
  images: many(productImages),
}));

export const productVariantsRelations = relations(
  productVariants,
  ({ one, many }) => ({
    product: one(products, {
      fields: [productVariants.storeId, productVariants.productId],
      references: [products.storeId, products.id],
    }),
    optionValues: many(productVariantOptionValues),
  }),
);

export const productOptionsRelations = relations(
  productOptions,
  ({ one, many }) => ({
    product: one(products, {
      fields: [productOptions.storeId, productOptions.productId],
      references: [products.storeId, products.id],
    }),
    values: many(productOptionValues),
  }),
);

export const productOptionValuesRelations = relations(
  productOptionValues,
  ({ one, many }) => ({
    option: one(productOptions, {
      fields: [
        productOptionValues.storeId,
        productOptionValues.productId,
        productOptionValues.optionId,
      ],
      references: [
        productOptions.storeId,
        productOptions.productId,
        productOptions.id,
      ],
    }),
    variants: many(productVariantOptionValues),
  }),
);

export const productVariantOptionValuesRelations = relations(
  productVariantOptionValues,
  ({ one }) => ({
    variant: one(productVariants, {
      fields: [
        productVariantOptionValues.storeId,
        productVariantOptionValues.productId,
        productVariantOptionValues.variantId,
      ],
      references: [
        productVariants.storeId,
        productVariants.productId,
        productVariants.id,
      ],
    }),
    optionValue: one(productOptionValues, {
      fields: [
        productVariantOptionValues.storeId,
        productVariantOptionValues.productId,
        productVariantOptionValues.optionId,
        productVariantOptionValues.optionValueId,
      ],
      references: [
        productOptionValues.storeId,
        productOptionValues.productId,
        productOptionValues.optionId,
        productOptionValues.id,
      ],
    }),
  }),
);

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.storeId, productImages.productId],
    references: [products.storeId, products.id],
  }),
}));
