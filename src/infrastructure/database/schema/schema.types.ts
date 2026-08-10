import { store, user } from './schema';

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type Store = typeof store.$inferSelect;
export type NewStore = typeof store.$inferInsert;
