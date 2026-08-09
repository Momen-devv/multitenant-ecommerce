import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user, organization } from './auth.schema';

export const store = pgTable('store', {
  id: text('id').primaryKey(),

  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),

  logo: text('logo'),
  logoKey: text('logo_key'),

  subscriptionId: text('subscription_id'),
  subscriptionStatus: text('subscription_status'),

  isActive: boolean('is_active').default(true),
  deactivatedAt: timestamp('deactivated_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const storeRelations = relations(store, ({ one }) => ({
  owner: one(user, {
    fields: [store.ownerId],
    references: [user.id],
  }),
}));

export const organizationWithStoreRelations = relations(
  organization,
  ({ one }) => ({
    store: one(store, {
      fields: [organization.id],
      references: [store.organizationId],
    }),
  }),
);
