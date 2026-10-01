import { writeOperationalNotificationIntent } from '@/modules/notifications/domain/operational-notification-intent';
import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { OutboxEventType } from '@/common/enums';
import {
  NOTIFICATION_INTENT_COMMITTED,
  type NotificationIntentCommitted,
} from '@/common/events/notification-intent-committed.event';
import { OutboxRepository } from '@/infrastructure/outbox/outbox.repository';
import { NotificationsQueueService } from '@/infrastructure/queue/notifications/notifications-queue.service';
import { NotificationEventsRepository } from '../repos/notification-events.repository';
import { LoggerService } from '@/infrastructure/logger/logger.service';

@Injectable()
export class NotificationOutboxDispatcher {
  private running = false;
  private wakePending = false;
  constructor(
    private readonly outbox: OutboxRepository,
    private readonly events: NotificationEventsRepository,
    private readonly queue: NotificationsQueueService,
    private readonly logger: LoggerService,
  ) {}

  @OnEvent(NOTIFICATION_INTENT_COMMITTED, { async: true })
  async committed(event: NotificationIntentCommitted) {
    if (!event.sourceId) return;
    this.wakePending = true;
    await this.dispatch();
  }

  @Interval('notification-outbox', 10_000)
  async dispatch() {
    if (this.running) return;
    this.running = true;
    try {
      do {
        this.wakePending = false;
        const rows = await this.outbox.claimDue(
          OutboxEventType.NOTIFICATION_INTENT,
          50,
          5 * 60_000,
        );
        // Ensure every event before scheduling, so fair scheduling includes the entire batch.
        const sources = new Map<string, string>();
        for (const row of rows) {
          try {
            const event = await this.events.ensure(row.payload);
            if (
              event.status === 'processed' ||
              event.status === 'dead_lettered'
            )
              await this.outbox.markPublished(row.id);
            else sources.set(event.id, row.id);
          } catch {
            const isAlert =
              row.payload !== null &&
              typeof row.payload === 'object' &&
              'eventType' in row.payload &&
              row.payload.eventType === 'notification.delivery_failed';
            await this.outbox.rescheduleAfterFailure(
              row.id,
              'Invalid notification intent',
              60_000,
              10,
              isAlert
                ? undefined
                : async (tx) => {
                    await writeOperationalNotificationIntent(
                      tx,
                      `notification-source-failed:${row.id}`,
                      row.id,
                      'notification.delivery_failed',
                    );
                  },
            );
          }
        }
        const due = await this.events.reserveDue();
        for (const event of due) {
          try {
            await this.queue.enqueue(event.id, event.enqueueGeneration);
            const sourceId = sources.get(event.id);
            if (sourceId) await this.outbox.markPublished(sourceId);
          } catch {
            await this.events.releaseEnqueue(event.id, event.enqueueGeneration);
          }
        }
      } while (this.wakePending);
    } catch {
      this.logger.error(
        'Notification dispatch failed',
        undefined,
        NotificationOutboxDispatcher.name,
      );
    } finally {
      this.running = false;
    }
  }
}
