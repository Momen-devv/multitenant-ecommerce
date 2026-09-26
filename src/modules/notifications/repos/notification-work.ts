import { sql } from 'drizzle-orm';

export const NOTIFICATION_LEASE_MS = 5 * 60_000;
export const PROVIDER_SAFETY_MS = 23 * 60 * 60_000;
export const notificationRetryAt = (attempts: number) =>
  new Date(
    Date.now() +
      Math.min(60 * 60_000, 60_000 * 2 ** Math.min(attempts - 1, 10)),
  );

/** One oldest item per Store per round; NULL is the platform bucket. */
export function fairDueEvents(limit: number) {
  return sql<{ id: string }>`select id from (
    select id, next_attempt_at, occurred_at,
      row_number() over (partition by store_id order by next_attempt_at, occurred_at, id) as round
    from notification_events where status in ('pending', 'processing')
      and next_attempt_at <= now() and (lease_expires_at is null or lease_expires_at <= now())
      and (last_queued_at is null or last_queued_at <= now() - interval '5 minutes')
  ) due order by round, next_attempt_at, occurred_at, id limit ${limit}`;
}
