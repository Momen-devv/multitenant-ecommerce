import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { notificationEvents } from '@/infrastructure/database/schema/notifications.schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import { generateUUIDv7 } from '@/common/utils';
import {
  fairDueEvents,
  NOTIFICATION_LEASE_MS,
  notificationRetryAt,
} from './notification-work';
import type { NotificationTransaction } from './notifications.repository';
import { writeOperationalNotificationIntent } from '@/modules/notifications/domain/operational-notification-intent';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { parseNotificationIntent } from '../domain/notification-event';
import type { NotificationEvent } from '@/infrastructure/database/schema/schema.types';

@Injectable()
export class NotificationEventsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async renew(id: string, token: string) {
    await this.db
      .update(notificationEvents)
      .set({ leaseExpiresAt: new Date(Date.now() + NOTIFICATION_LEASE_MS) })
      .where(
        and(
          eq(notificationEvents.id, id),
          eq(notificationEvents.leaseToken, token),
          eq(notificationEvents.status, 'processing'),
          gt(
            notificationEvents.leaseExpiresAt,
            sql<Date>`statement_timestamp()`,
          ),
        ),
      );
  }

  async reserveDue(limit = 50) {
    const candidates = await fairDueEvents(this.db, limit);
    const reserved: NotificationEvent[] = [];
    for (const candidate of candidates) {
      const row = await this.reserve(candidate.id);
      if (row) reserved.push(row);
    }
    return reserved;
  }

  async reserve(id: string) {
    const now = new Date();
    const [row] = await this.db
      .update(notificationEvents)
      .set({
        enqueueGeneration: sql`${notificationEvents.enqueueGeneration} + 1`,
        lastQueuedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationEvents.id, id),
          or(
            eq(notificationEvents.status, 'pending'),
            eq(notificationEvents.status, 'processing'),
          ),
          lte(notificationEvents.nextAttemptAt, now),
          or(
            isNull(notificationEvents.leaseExpiresAt),
            lte(notificationEvents.leaseExpiresAt, now),
          ),
          or(
            isNull(notificationEvents.lastQueuedAt),
            lte(
              notificationEvents.lastQueuedAt,
              new Date(now.getTime() - NOTIFICATION_LEASE_MS),
            ),
          ),
        ),
      )
      .returning();
    return row;
  }

  async releaseEnqueue(id: string, generation: number) {
    await this.db
      .update(notificationEvents)
      .set({ lastQueuedAt: null })
      .where(
        and(
          eq(notificationEvents.id, id),
          eq(notificationEvents.enqueueGeneration, generation),
        ),
      );
  }

  async claim(id: string) {
    const now = new Date();
    const [row] = await this.db
      .update(notificationEvents)
      .set({
        status: 'processing',
        leaseToken: generateUUIDv7(),
        leaseExpiresAt: new Date(now.getTime() + NOTIFICATION_LEASE_MS),
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationEvents.id, id),
          or(
            eq(notificationEvents.status, 'pending'),
            eq(notificationEvents.status, 'processing'),
          ),
          lte(notificationEvents.nextAttemptAt, now),
          or(
            isNull(notificationEvents.leaseExpiresAt),
            lte(notificationEvents.leaseExpiresAt, now),
          ),
        ),
      )
      .returning();
    return row;
  }

  async checkpoint(
    id: string,
    token: string,
    work: (
      tx: NotificationTransaction,
      event: Pick<NotificationEvent, 'fanoutProgress' | 'recipientCount'>,
    ) => Promise<number>,
  ) {
    return this.db.transaction(async (tx) => {
      const [event] = await tx
        .select({
          fanoutProgress: notificationEvents.fanoutProgress,
          recipientCount: notificationEvents.recipientCount,
        })
        .from(notificationEvents)
        .where(
          and(
            eq(notificationEvents.id, id),
            eq(notificationEvents.leaseToken, token),
            eq(notificationEvents.status, 'processing'),
            gt(
              notificationEvents.leaseExpiresAt,
              sql<Date>`statement_timestamp()`,
            ),
          ),
        )
        .for('update');
      if (!event) return null;
      const progress = await work(tx, event);
      const complete = progress === event.recipientCount;
      await tx
        .update(notificationEvents)
        .set({
          fanoutProgress: progress,
          status: complete ? 'processed' : 'processing',
          processedAt: complete ? new Date() : null,
          leaseToken: complete ? null : token,
          leaseExpiresAt: complete
            ? null
            : new Date(Date.now() + NOTIFICATION_LEASE_MS),
          updatedAt: new Date(),
          lastError: null,
        })
        .where(
          and(
            eq(notificationEvents.id, id),
            eq(notificationEvents.leaseToken, token),
          ),
        );
      return complete;
    });
  }

  async fail(id: string, token: string, permanent: boolean) {
    await this.db.transaction(async (tx) => {
      const [event] = await tx
        .select()
        .from(notificationEvents)
        .where(
          and(
            eq(notificationEvents.id, id),
            eq(notificationEvents.leaseToken, token),
          ),
        )
        .for('update');
      if (!event) return;
      const attempts = event.attempts + 1;
      const terminal = permanent || attempts >= 10;
      await tx
        .update(notificationEvents)
        .set({
          status: terminal ? 'dead_lettered' : 'pending',
          attempts,
          nextAttemptAt: notificationRetryAt(attempts),
          lastQueuedAt: null,
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
          lastError: 'Notification materialization failed',
          deadLetteredAt: terminal ? new Date() : null,
          deadLetterReason: terminal
            ? 'Notification materialization failed'
            : null,
        })
        .where(
          and(
            eq(notificationEvents.id, id),
            eq(notificationEvents.leaseToken, token),
          ),
        );
      if (terminal && event.eventType !== 'notification.delivery_failed')
        await writeOperationalNotificationIntent(
          tx,
          `notification-event-failed:${id}`,
          id,
          'notification.delivery_failed',
        );
    });
  }

  /** Only immutable content is inserted; retry never resets processing metadata. */
  async ensure(value: unknown): Promise<NotificationEvent> {
    const intent = parseNotificationIntent(value);
    await this.db
      .insert(notificationEvents)
      .values({
        sourceKey: intent.sourceKey,
        eventType: intent.eventType,
        aggregateId: intent.aggregateId,
        aggregateVersion: intent.aggregateVersion,
        storeId: intent.storeId,
        payloadVersion: intent.payloadVersion,
        payload: intent,
        audienceSnapshot: intent.recipients,
        occurredAt: intent.occurredAt,
        recipientCount: intent.recipients.length,
      })
      .onConflictDoNothing({ target: notificationEvents.sourceKey });
    const [event] = await this.db
      .select()
      .from(notificationEvents)
      .where(eq(notificationEvents.sourceKey, intent.sourceKey));
    if (
      event.eventType !== intent.eventType ||
      event.aggregateId !== intent.aggregateId ||
      event.aggregateVersion !== intent.aggregateVersion ||
      event.storeId !== intent.storeId
    ) {
      throw new Error(
        'Notification source key conflicts with an existing event',
      );
    }
    return event;
  }
}
