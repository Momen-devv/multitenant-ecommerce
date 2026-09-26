import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { notificationEvents } from '@/infrastructure/database/schema/notifications.schema';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { parseNotificationIntent } from '../domain/notification-event';
import type { NotificationEvent } from '@/infrastructure/database/schema/schema.types';

@Injectable()
export class NotificationEventsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

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
