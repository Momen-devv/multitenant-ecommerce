import {
  billingCustomers,
  planPrices,
  plans,
  store,
  storeLifecycleAudit,
  subscriptions,
  user,
} from './schema';

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type Store = typeof store.$inferSelect;
export type NewStore = typeof store.$inferInsert;

export type StoreLifecycleAudit = typeof storeLifecycleAudit.$inferSelect;
export type NewStoreLifecycleAudit = typeof storeLifecycleAudit.$inferInsert;

export type PlanPrice = typeof planPrices.$inferSelect;
export type NewPlanPrice = typeof planPrices.$inferInsert;

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

export type BillingCustomer = typeof billingCustomers.$inferSelect;
export type NewBillingCustomer = typeof billingCustomers.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
