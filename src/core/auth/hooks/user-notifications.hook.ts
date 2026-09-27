import type { BetterAuthOptions } from 'better-auth/minimal';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import { captureRegisteredUser } from '@/infrastructure/outbox/welcome-intent.writer';

/** Installed with-hooks.mjs queues after-hooks after the adapter transaction.
 * Persisted User reconciliation is authoritative if this best-effort hint fails.
 */
export function createUserNotificationHooks(db: NodePgDatabase<typeof schema>) {
  return {
    user: {
      create: {
        after: async (user) => {
          await captureRegisteredUser(db, user.id).catch(() => undefined);
        },
      },
    },
  } satisfies NonNullable<BetterAuthOptions['databaseHooks']>;
}
