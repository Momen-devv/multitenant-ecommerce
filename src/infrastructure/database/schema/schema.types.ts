import {
  billingCustomers,
  billingWebhookEvents,
  planPrices,
  plans,
  productImages,
  productOptions,
  productOptionValues,
  productVariantOptionValues,
  productVariants,
  products,
  store,
  storeLifecycleAudit,
  subscriptionCheckoutAttempts,
  subscriptions,
  user,
} from './schema';

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type Store = typeof store.$inferSelect;
export type NewStore = typeof store.$inferInsert;

export type StoreLifecycleAudit = typeof storeLifecycleAudit.$inferSelect;
export type NewStoreLifecycleAudit = typeof storeLifecycleAudit.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;

export type ProductOption = typeof productOptions.$inferSelect;
export type NewProductOption = typeof productOptions.$inferInsert;

export type ProductOptionValue = typeof productOptionValues.$inferSelect;
export type NewProductOptionValue = typeof productOptionValues.$inferInsert;

export type ProductVariantOptionValue =
  typeof productVariantOptionValues.$inferSelect;
export type NewProductVariantOptionValue =
  typeof productVariantOptionValues.$inferInsert;

export type ProductImage = typeof productImages.$inferSelect;
export type NewProductImage = typeof productImages.$inferInsert;

export type PlanPrice = typeof planPrices.$inferSelect;
export type NewPlanPrice = typeof planPrices.$inferInsert;

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

export type BillingCustomer = typeof billingCustomers.$inferSelect;
export type NewBillingCustomer = typeof billingCustomers.$inferInsert;

export type BillingWebhookEvent = typeof billingWebhookEvents.$inferSelect;
export type NewBillingWebhookEvent = typeof billingWebhookEvents.$inferInsert;

export type SubscriptionCheckoutAttempt =
  typeof subscriptionCheckoutAttempts.$inferSelect;
export type NewSubscriptionCheckoutAttempt =
  typeof subscriptionCheckoutAttempts.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
