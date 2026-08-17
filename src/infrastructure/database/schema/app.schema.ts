import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user, organization } from './auth.schema';

export const storeStatus = pgEnum('store_status', [
  'active',
  'owner_closed',
  'platform_suspended',
]);

export const storeLifecycleActorAuthority = pgEnum('store_actor_authority', [
  'store_owner',
  'platform_super_admin',
]);

export const store = pgTable('store', {
  id: uuid('id').defaultRandom().primaryKey(),

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

  logo: text('logo'),
  logoKey: text('logo_key'),

  status: storeStatus('status').default('active').notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const storeLifecycleAudit = pgTable(
  'store_lifecycle_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),

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
