import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lte,
  min,
  ne,
  notExists,
  notInArray,
  or,
  sum,
} from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import {
  notifications as inbox,
  notificationEvents as events,
  notificationEmailDeliveries as deliveries,
  invitationNotificationState as invitations,
  outboxEvents as outbox,
} from '@/infrastructure/database/schema/schema';
import { OutboxEventType } from '@/common/enums/outbox-event-type.enum';

@Injectable()
export class NotificationOperationsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async metrics() {
    const [eventMetrics, deliveryMetrics] = await Promise.all([
      this.db
        .select({
          status: events.status,
          count: count(),
          oldest: min(events.occurredAt),
          retries: sum(events.attempts),
        })
        .from(events)
        .groupBy(events.status),
      this.db
        .select({
          status: deliveries.status,
          count: count(),
          oldest: min(events.occurredAt),
          retries: sum(deliveries.attempts),
        })
        .from(deliveries)
        .innerJoin(events, eq(events.id, deliveries.eventId))
        .groupBy(deliveries.status),
    ]);
    const now = Date.now();
    const snapshot = (
      kind: string,
      row: {
        status: string;
        count: number;
        oldest: Date | null;
        retries: string | null;
      },
      active: string[],
    ) => ({
      kind,
      status: row.status,
      count: row.count,
      backlog_age_seconds:
        active.includes(row.status) && row.oldest
          ? (now - row.oldest.getTime()) / 1000
          : 0,
      retries: Number(row.retries ?? 0),
    });
    return [
      ...eventMetrics.map((row) =>
        snapshot('event', row, ['pending', 'processing']),
      ),
      ...deliveryMetrics.map((row) =>
        snapshot('delivery', row, ['pending', 'sending']),
      ),
    ];
  }

  /** Bounded batches, locked against checkpoints; never delete dedupe/source milestones. */
  async cleanup() {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const inboxCutoff = new Date(now.getTime() - 90 * 86400000);
      const metadataCutoff = new Date(now.getTime() - 180 * 86400000);
      const activeDelivery = tx
        .select({ id: deliveries.id })
        .from(deliveries)
        .where(
          and(
            eq(deliveries.eventId, events.id),
            inArray(deliveries.status, ['pending', 'sending']),
          ),
        );

      const expiredInbox = await tx
        .select({ id: inbox.id })
        .from(inbox)
        .where(lte(inbox.occurredAt, inboxCutoff))
        .orderBy(inbox.occurredAt, inbox.id)
        .limit(500)
        .for('update', { skipLocked: true });
      if (expiredInbox.length)
        await tx.delete(inbox).where(
          inArray(
            inbox.id,
            expiredInbox.map((row) => row.id),
          ),
        );

      const expiredDeliveries = await tx
        .select({ id: deliveries.id })
        .from(deliveries)
        .innerJoin(events, eq(events.id, deliveries.eventId))
        .where(
          and(
            lte(events.occurredAt, metadataCutoff),
            inArray(deliveries.status, [
              'sent',
              'suppressed',
              'dead_lettered',
              'review_required',
            ]),
            or(
              isNull(deliveries.leaseExpiresAt),
              lte(deliveries.leaseExpiresAt, now),
            ),
            or(
              isNotNull(deliveries.payload),
              isNotNull(deliveries.recipientEmail),
              isNotNull(deliveries.lastError),
            ),
          ),
        )
        .orderBy(events.occurredAt, deliveries.id)
        .limit(500)
        .for('update', { of: deliveries, skipLocked: true });
      if (expiredDeliveries.length)
        await tx
          .update(deliveries)
          .set({
            payload: null,
            recipientEmail: null,
            providerMessageId: null,
            lastError: null,
            deadLetterReason: null,
            suppressionReason: null,
            updatedAt: now,
          })
          .where(
            inArray(
              deliveries.id,
              expiredDeliveries.map((row) => row.id),
            ),
          );

      const expiredEvents = await tx
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            lte(events.occurredAt, metadataCutoff),
            inArray(events.status, ['processed', 'dead_lettered']),
            or(isNull(events.leaseExpiresAt), lte(events.leaseExpiresAt, now)),
            or(
              isNotNull(events.payload),
              isNotNull(events.audienceSnapshot),
              isNotNull(events.lastError),
            ),
            notExists(activeDelivery),
          ),
        )
        .orderBy(events.occurredAt, events.id)
        .limit(500)
        .for('update', { skipLocked: true });
      if (expiredEvents.length)
        await tx
          .update(events)
          .set({
            payload: null,
            audienceSnapshot: null,
            lastError: null,
            deadLetterReason: null,
            updatedAt: now,
          })
          .where(
            inArray(
              events.id,
              expiredEvents.map((row) => row.id),
            ),
          );

      const expiredOutbox = await tx
        .select({ id: outbox.id })
        .from(outbox)
        .innerJoin(events, eq(events.sourceKey, outbox.deduplicationKey))
        .where(
          and(
            eq(outbox.eventType, OutboxEventType.NOTIFICATION_INTENT),
            or(isNotNull(outbox.publishedAt), isNotNull(outbox.deadLetteredAt)),
            lte(events.occurredAt, metadataCutoff),
            isNull(events.payload),
            ne(outbox.payload, {}),
          ),
        )
        .orderBy(outbox.createdAt, outbox.id)
        .limit(500)
        .for('update', { of: outbox, skipLocked: true });
      if (expiredOutbox.length)
        await tx
          .update(outbox)
          .set({ payload: {}, lastError: null })
          .where(
            inArray(
              outbox.id,
              expiredOutbox.map((row) => row.id),
            ),
          );

      const activeInvitationEvent = tx
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.aggregateId, invitations.invitationId),
            or(
              inArray(events.status, ['pending', 'processing']),
              exists(activeDelivery),
            ),
          ),
        );
      const expiredInvitations = await tx
        .select({ id: invitations.invitationId })
        .from(invitations)
        .where(
          and(
            notInArray(invitations.status, ['pending', 'accepting']),
            lte(invitations.updatedAt, metadataCutoff),
            isNotNull(invitations.normalizedEmail),
            notExists(activeInvitationEvent),
          ),
        )
        .orderBy(invitations.updatedAt, invitations.invitationId)
        .limit(500)
        .for('update', { skipLocked: true });
      if (expiredInvitations.length)
        await tx
          .update(invitations)
          .set({ normalizedEmail: null, boundUserId: null })
          .where(
            inArray(
              invitations.invitationId,
              expiredInvitations.map((row) => row.id),
            ),
          );
      return {
        inbox: expiredInbox.length,
        deliveries: expiredDeliveries.length,
        events: expiredEvents.length,
        outbox: expiredOutbox.length,
        invitations: expiredInvitations.length,
      };
    });
  }
}
