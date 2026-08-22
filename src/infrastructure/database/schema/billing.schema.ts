import { PlanProvisioningStatus } from '@/common/enums';
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
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

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
