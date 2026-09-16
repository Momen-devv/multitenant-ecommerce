import { relations, sql } from 'drizzle-orm';
import {
  check,
  boolean,
  bigint,
  integer,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user, organization } from './auth.schema';
import { generateUUIDv7 } from '@/common/utils';
import { StoreStatus } from '@/common/enums';

export const storeStatus = pgEnum('store_status', [
  StoreStatus.ACTIVE,
  StoreStatus.OWNER_CLOSED,
  StoreStatus.PLATFORM_SUSPENDED,
]);

export const storeLifecycleActorAuthority = pgEnum('store_actor_authority', [
  'store_owner',
  'platform_super_admin',
]);

export const store = pgTable(
  'store',
  {
    id: uuid('id').$defaultFn(generateUUIDv7).primaryKey(),

    organizationId: text('organization_id')
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: 'restrict' }),

    ownerId: text('owner_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    defaultCurrency: varchar('default_currency', { length: 3 })
      .notNull()
      .default('usd'),

    logo: text('logo'),
    logoKey: text('logo_key'),

    status: storeStatus('status').default(StoreStatus.ACTIVE).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('store_name_trgm_idx').using(
      'gin',
      table.name.asc().op('gin_trgm_ops'),
    ),
    index('store_slug_trgm_idx').using(
      'gin',
      table.slug.asc().op('gin_trgm_ops'),
    ),
    check(
      'store_default_currency_format_check',
      sql`${table.defaultCurrency} ~ '^[a-z]{3}$'`,
    ),
  ],
);

export const storeLifecycleAudit = pgTable(
  'store_lifecycle_audit',
  {
    id: uuid('id').$defaultFn(generateUUIDv7).primaryKey(),

    storeId: uuid('store_id')
      .notNull()
      .references(() => store.id, { onDelete: 'restrict' }),

    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),

    actorAuthority: storeLifecycleActorAuthority('actor_authority').notNull(),
    previousStatus: storeStatus('previous_status').notNull(),
    newStatus: storeStatus('new_status').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('store_lifecycle_audit_store_id_idx').on(table.storeId),
    check(
      'store_lifecycle_audit_reason_length',
      sql`char_length(trim(${table.reason})) BETWEEN 10 AND 500`,
    ),
  ],
);

/**
 * Owner-configured checkout preferences. Effective checkout availability is
 * derived at read time from this desired configuration, Store lifecycle, and
 * the current subscription/payment state.
 */
export const storeCheckoutSettings = pgTable(
  'store_checkout_settings',
  {
    storeId: uuid('store_id')
      .primaryKey()
      .references(() => store.id, { onDelete: 'restrict' }),
    // PostgreSQL integer cannot represent every safe JavaScript version.
    version: bigint('version', { mode: 'number' }).notNull().default(1),
    shippingFee: integer('shipping_fee').notNull().default(0),
    deliveryCountries: text('delivery_countries')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    shippingPolicy: text('shipping_policy'),
    cashOnDeliveryEnabled: boolean('cash_on_delivery_enabled')
      .notNull()
      .default(false),
    onlineEnabled: boolean('online_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'store_checkout_settings_version_positive_check',
      sql`${table.version} > 0`,
    ),
    check(
      'store_checkout_settings_shipping_fee_range_check',
      sql`${table.shippingFee} BETWEEN 0 AND 1000000`,
    ),
  ],
);

export const userAddresses = pgTable(
  'user_addresses',
  {
    id: uuid('id').$defaultFn(generateUUIDv7).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 100 }).notNull(),
    recipientName: varchar('recipient_name', { length: 200 }).notNull(),
    recipientPhone: varchar('recipient_phone', { length: 50 }).notNull(),
    addressLine1: varchar('address_line_1', { length: 200 }).notNull(),
    addressLine2: varchar('address_line_2', { length: 200 }),
    city: varchar('city', { length: 100 }).notNull(),
    region: varchar('region', { length: 100 }),
    postalCode: varchar('postal_code', { length: 32 }),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    creationIdempotencyKey: varchar('creation_idempotency_key', {
      length: 255,
    }),
    creationRequestFingerprint: varchar('creation_request_fingerprint', {
      length: 64,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('user_addresses_user_id_idx').on(table.userId),
    uniqueIndex('user_addresses_one_default_uidx')
      .on(table.userId)
      .where(sql`${table.isDefault}`),
    uniqueIndex('user_addresses_create_idempotency_uidx').on(
      table.userId,
      table.creationIdempotencyKey,
    ),
    check(
      'user_addresses_label_check',
      sql`${table.label} = trim(${table.label}) AND char_length(${table.label}) BETWEEN 1 AND 100`,
    ),
    check(
      'user_addresses_recipient_name_check',
      sql`${table.recipientName} = trim(${table.recipientName}) AND char_length(${table.recipientName}) BETWEEN 1 AND 200`,
    ),
    check(
      'user_addresses_address_line_1_check',
      sql`${table.addressLine1} = trim(${table.addressLine1}) AND char_length(${table.addressLine1}) BETWEEN 1 AND 200`,
    ),
    check(
      'user_addresses_recipient_phone_check',
      sql`${table.recipientPhone} = trim(${table.recipientPhone}) AND char_length(${table.recipientPhone}) BETWEEN 3 AND 50`,
    ),
    check(
      'user_addresses_address_line_2_check',
      sql`${table.addressLine2} IS NULL OR (${table.addressLine2} = trim(${table.addressLine2}) AND char_length(${table.addressLine2}) BETWEEN 1 AND 200)`,
    ),
    check(
      'user_addresses_city_check',
      sql`${table.city} = trim(${table.city}) AND char_length(${table.city}) BETWEEN 1 AND 100`,
    ),
    check(
      'user_addresses_region_check',
      sql`${table.region} IS NULL OR (${table.region} = trim(${table.region}) AND char_length(${table.region}) BETWEEN 1 AND 100)`,
    ),
    check(
      'user_addresses_postal_code_check',
      sql`${table.postalCode} IS NULL OR (${table.postalCode} = trim(${table.postalCode}) AND char_length(${table.postalCode}) BETWEEN 1 AND 32)`,
    ),
    check(
      'user_addresses_country_code_check',
      sql`${table.countryCode} ~ '^[A-Z]{2}$'`,
    ),
    check(
      'user_addresses_create_idempotency_key_check',
      sql`${table.creationIdempotencyKey} IS NULL OR (${table.creationIdempotencyKey} = trim(${table.creationIdempotencyKey}) AND char_length(${table.creationIdempotencyKey}) BETWEEN 1 AND 255)`,
    ),
    check(
      'user_addresses_create_idempotency_pair_check',
      sql`(${table.creationIdempotencyKey} IS NULL AND ${table.creationRequestFingerprint} IS NULL) OR (${table.creationIdempotencyKey} IS NOT NULL AND ${table.creationRequestFingerprint} ~ '^[a-f0-9]{64}$')`,
    ),
  ],
);

export const storeRelations = relations(store, ({ one }) => ({
  owner: one(user, {
    fields: [store.ownerId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [store.organizationId],
    references: [organization.id],
  }),
}));

export const storeCheckoutSettingsRelations = relations(
  storeCheckoutSettings,
  ({ one }) => ({
    store: one(store, {
      fields: [storeCheckoutSettings.storeId],
      references: [store.id],
    }),
  }),
);

export const storeLifecycleAuditRelations = relations(
  storeLifecycleAudit,
  ({ one }) => ({
    store: one(store, {
      fields: [storeLifecycleAudit.storeId],
      references: [store.id],
    }),
    actor: one(user, {
      fields: [storeLifecycleAudit.actorId],
      references: [user.id],
    }),
  }),
);

export const userAddressesRelations = relations(userAddresses, ({ one }) => ({
  user: one(user, {
    fields: [userAddresses.userId],
    references: [user.id],
  }),
}));
