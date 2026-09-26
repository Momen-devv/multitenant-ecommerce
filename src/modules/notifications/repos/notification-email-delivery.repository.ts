import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { generateUUIDv7 } from '@/common/utils';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import { notificationEmailDeliveries as d } from '@/infrastructure/database/schema/notifications.schema';
import {
  NOTIFICATION_LEASE_MS,
  notificationRetryAt,
} from './notification-work';
import { writeOperationalNotificationIntent } from '@/modules/notifications/domain/operational-notification-intent';

@Injectable()
export class NotificationEmailDeliveryRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async reserveDue(limit = 50) {
    const candidates = await this.db.execute<{
      id: string;
    }>(sql`select id from (
      select d.id, d.next_attempt_at, e.occurred_at,
        row_number() over (partition by e.store_id order by d.next_attempt_at, e.occurred_at, d.id) as round
      from notification_email_deliveries d join notification_events e on e.id = d.event_id
      where d.status in ('pending', 'sending') and d.next_attempt_at <= now()
        and (d.lease_expires_at is null or d.lease_expires_at <= now())
        and (d.last_queued_at is null or d.last_queued_at <= now() - interval '5 minutes')
    ) due order by round, next_attempt_at, occurred_at, id limit ${limit}`);
    const rows: (typeof d.$inferSelect)[] = [];
    for (const candidate of candidates.rows) {
      const now = new Date();
      const [row] = await this.db
        .update(d)
        .set({
          enqueueGeneration: sql`${d.enqueueGeneration} + 1`,
          lastQueuedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(d.id, candidate.id),
            this.due(now),
            or(
              isNull(d.lastQueuedAt),
              lte(
                d.lastQueuedAt,
                new Date(now.getTime() - NOTIFICATION_LEASE_MS),
              ),
            ),
          ),
        )
        .returning();
      if (row) rows.push(row);
    }
    return rows;
  }

  private due(now: Date) {
    return and(
      or(eq(d.status, 'pending'), eq(d.status, 'sending')),
      lte(d.nextAttemptAt, now),
      or(isNull(d.leaseExpiresAt), lte(d.leaseExpiresAt, now)),
    );
  }

  async releaseEnqueue(id: string, generation: number) {
    await this.db
      .update(d)
      .set({ lastQueuedAt: null })
      .where(and(eq(d.id, id), eq(d.enqueueGeneration, generation)));
  }

  async claim(id: string) {
    const now = new Date();
    const [row] = await this.db
      .update(d)
      .set({
        status: 'sending',
        leaseToken: generateUUIDv7(),
        leaseExpiresAt: new Date(now.getTime() + NOTIFICATION_LEASE_MS),
        updatedAt: now,
      })
      .where(and(eq(d.id, id), this.due(now)))
      .returning();
    return row;
  }

  async renew(id: string, token: string) {
    const [row] = await this.db
      .update(d)
      .set({ leaseExpiresAt: new Date(Date.now() + NOTIFICATION_LEASE_MS) })
      .where(
        and(
          eq(d.id, id),
          eq(d.leaseToken, token),
          sql`${d.leaseExpiresAt} > now()`,
        ),
      )
      .returning({ id: d.id });
    return Boolean(row);
  }

  async beginProviderRequest(id: string, token: string) {
    const [row] = await this.db
      .update(d)
      .set({
        providerDispatchedAt: sql`coalesce(${d.providerDispatchedAt}, now())`,
      })
      .where(
        and(
          eq(d.id, id),
          eq(d.leaseToken, token),
          sql`${d.leaseExpiresAt} > now()`,
        ),
      )
      .returning();
    return row;
  }

  async suppress(id: string, token: string, reason: string) {
    await this.db
      .update(d)
      .set({
        status: 'suppressed',
        suppressedAt: new Date(),
        suppressionReason: reason,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(d.id, id), eq(d.leaseToken, token)));
  }

  async sent(id: string, token: string, providerId?: string) {
    await this.db
      .update(d)
      .set({
        status: 'sent',
        sentAt: new Date(),
        providerMessageId: providerId ?? null,
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(d.id, id), eq(d.leaseToken, token)));
  }

  async fail(id: string, token: string, permanent: boolean, ambiguous = false) {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(d)
        .where(and(eq(d.id, id), eq(d.leaseToken, token)))
        .for('update');
      if (!current) return;
      const attempts = current.attempts + 1;
      const terminal = permanent || ambiguous || attempts >= 10;
      const reason = ambiguous
        ? 'Provider idempotency safety window exceeded'
        : 'Email provider delivery failed';
      await tx
        .update(d)
        .set({
          status: ambiguous
            ? 'review_required'
            : terminal
              ? 'dead_lettered'
              : 'pending',
          attempts,
          nextAttemptAt: notificationRetryAt(attempts),
          lastQueuedAt: null,
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
          lastError: reason,
          deadLetteredAt: terminal ? new Date() : null,
          deadLetterReason: terminal ? reason : null,
        })
        .where(and(eq(d.id, id), eq(d.leaseToken, token)));
      // Guard using immutable event identity even when delivery payload is absent.
      const [event] = await tx
        .select({ type: schema.notificationEvents.eventType })
        .from(schema.notificationEvents)
        .where(eq(schema.notificationEvents.id, current.eventId));
      if (terminal && event?.type !== 'notification.delivery_failed')
        await writeOperationalNotificationIntent(
          tx,
          `notification-delivery-failed:${id}`,
          id,
          'notification.delivery_failed',
        );
    });
  }
}
