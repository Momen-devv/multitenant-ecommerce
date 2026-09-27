import { NotificationStreamService } from './notification-stream.service';
import { Injectable } from '@nestjs/common';
import { ZodError } from 'zod';
import { NotificationEventsRepository } from '../repos/notification-events.repository';
import { NotificationsRepository } from '../repos/notifications.repository';
import { NotificationPreferencesRepository } from '../repos/notification-preferences.repository';
import { parseNotificationIntent } from '../domain/notification-event';
import { NOTIFICATION_METADATA_RETENTION_MS } from '../domain/notification-retention';

@Injectable()
export class NotificationMaterializationService {
  constructor(
    private readonly stream: NotificationStreamService,
    private readonly events: NotificationEventsRepository,
    private readonly inbox: NotificationsRepository,
    private readonly preferences: NotificationPreferencesRepository,
  ) {}

  async process(eventId: string) {
    const event = await this.events.claim(eventId);
    if (!event?.leaseToken) return;
    const token = event.leaseToken;
    const heartbeat = setInterval(() => {
      void this.events.renew(event.id, token).catch(() => undefined);
    }, 60_000);
    heartbeat.unref();
    try {
      const intent = parseNotificationIntent(event.payload);
      if (intent.recipients.length !== event.recipientCount)
        throw new Error('Invalid recipient count');
      if (
        Date.now() >=
        intent.occurredAt.getTime() + NOTIFICATION_METADATA_RETENTION_MS
      )
        throw new ZodError([]);
      for (;;) {
        const users = new Set<string>();
        const complete = await this.events.checkpoint(
          event.id,
          event.leaseToken,
          async (tx, current) => {
            const batch = intent.recipients.slice(
              current.fanoutProgress,
              current.fanoutProgress + 25,
            );
            for (const recipient of batch) {
              const enabled = await this.preferences.recipientEmailEnabled(
                recipient,
                intent.storeId,
                intent.eventType,
                tx,
              );
              const userId = await this.inbox.materializeRecipient(
                tx,
                event.id,
                intent,
                recipient,
                enabled,
              );
              if (userId) users.add(userId);
            }
            return current.fanoutProgress + batch.length;
          },
        );
        if (complete !== null)
          await Promise.all([...users].map((id) => this.stream.publish(id)));
        if (complete === null || complete) return;
      }
    } catch (error) {
      await this.events.fail(
        event.id,
        event.leaseToken,
        error instanceof ZodError,
      );
    } finally {
      clearInterval(heartbeat);
    }
  }
}
