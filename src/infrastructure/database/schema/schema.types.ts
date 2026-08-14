import { store, storeLifecycleAudit, user } from './schema';

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type Store = typeof store.$inferSelect;
export type NewStore = typeof store.$inferInsert;

export type StoreLifecycleAudit = typeof storeLifecycleAudit.$inferSelect;
export type NewStoreLifecycleAudit = typeof storeLifecycleAudit.$inferInsert;
