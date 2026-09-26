import { and, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import { notificationEvents as e } from '@/infrastructure/database/schema/notifications.schema';

export const NOTIFICATION_LEASE_MS = 5 * 60_000;
export const PROVIDER_SAFETY_MS = 23 * 60 * 60_000;
export const notificationRetryAt = (attempts: number) =>
  new Date(
    Date.now() +
      Math.min(60 * 60_000, 60_000 * 2 ** Math.min(attempts - 1, 10)),
  );

/** One oldest item per Store per round; NULL is the platform bucket. */
export function fairDueEvents(
  db: Pick<NodePgDatabase<typeof schema>, 'select'>,
  limit: number,
) {
  const now = new Date();
  const due = db
    .select({
      id: e.id,
      nextAttemptAt: e.nextAttemptAt,
      occurredAt: e.occurredAt,
      round:
        sql<number>`row_number() over (partition by ${e.storeId} order by ${e.nextAttemptAt}, ${e.occurredAt}, ${e.id})`.as(
          'round',
        ),
    })
    .from(e)
    .where(
      and(
        inArray(e.status, ['pending', 'processing']),
        lte(e.nextAttemptAt, now),
        or(isNull(e.leaseExpiresAt), lte(e.leaseExpiresAt, now)),
        or(
          isNull(e.lastQueuedAt),
          lte(e.lastQueuedAt, new Date(now.getTime() - NOTIFICATION_LEASE_MS)),
        ),
      ),
    )
    .as('due');
  return db
    .select({ id: due.id })
    .from(due)
    .orderBy(due.round, due.nextAttemptAt, due.occurredAt, due.id)
    .limit(limit);
}
