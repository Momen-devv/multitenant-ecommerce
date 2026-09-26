import { createHash } from 'node:crypto';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import {
  notifications,
  notificationRecipientStates as states,
  notificationEmailDeliveries as deliveries,
  notificationEvents,
} from '@/infrastructure/database/schema/notifications.schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { parseNotificationIntent } from '../domain/notification-event';
import { notificationPolicy } from '../domain/notification-policy';
import { visibleNotification } from './notification-inbox.repository';
import {
  notificationEmailOwner,
  notificationRecipientIdentity,
  type NotificationRecipient,
} from '../domain/notification-recipient';

export type NotificationTransaction = Parameters<
  Parameters<NodePgDatabase<typeof schema>['transaction']>[0]
>[0];

@Injectable()
export class NotificationsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /** Called inside the worker's leased checkpoint transaction. No external work.
   * Binding an email-only invitation later is a separate verified-identity operation.
   */
  async materializeRecipient(
    tx: NotificationTransaction,
    eventId: string,
    recipient: NotificationRecipient,
    emailEnabled: boolean,
  ) {
    const [event] = await tx
      .select()
      .from(notificationEvents)
      .where(eq(notificationEvents.id, eventId));
    if (!event?.payload)
      throw new Error('Notification event payload unavailable');
    const intent = parseNotificationIntent(event.payload);
    const identity = notificationRecipientIdentity(recipient);
    const snapshot = intent.recipients.find(
      (item) => notificationRecipientIdentity(item) === identity,
    );
    if (!snapshot) throw new Error('Recipient is absent from event snapshot');
    recipient = snapshot;
    const now = new Date();
    if (now.getTime() >= intent.occurredAt.getTime() + 180 * 86400000) {
      throw new Error('Notification is outside the supported replay period');
    }
    const expired =
      now.getTime() >= intent.occurredAt.getTime() + 90 * 86400000;
    const [claimed] = await tx
      .insert(states)
      .values({
        eventId,
        recipientIdentity: identity,
        userId: recipient.userId,
        audiences: recipient.audiences,
        occurredAt: intent.occurredAt,
        outcome: expired
          ? 'expired'
          : recipient.userId
            ? 'materialized'
            : 'pending_binding',
        materializedAt: recipient.userId && !expired ? now : null,
      })
      .onConflictDoNothing()
      .returning({ id: states.id });
    // Tombstone takes precedence over any attempt to reconstruct cleaned history.
    if (!claimed) return false;
    if (recipient.userId && !expired)
      await tx
        .insert(notifications)
        .values({
          eventId,
          recipientUserId: recipient.userId,
          audiences: recipient.audiences,
          storeId: intent.storeId,
          type: intent.eventType,
          display: intent.display,
          resource: intent.resource,
          occurredAt: intent.occurredAt,
        })
        .onConflictDoNothing();
    // Legacy shopper delivery owns ALL Order customer/staff overlap sends.
    if (
      recipient.email &&
      (emailEnabled ||
        recipient.audiences.some(
          (audience) =>
            notificationPolicy(intent.eventType, audience).mandatory,
        )) &&
      notificationEmailOwner(intent.eventType, recipient) === 'notification' &&
      now.getTime() < intent.occurredAt.getTime() + 180 * 86400000
    ) {
      await tx
        .insert(deliveries)
        .values({
          eventId,
          recipientIdentity: identity,
          recipientUserId: recipient.userId,
          recipientEmail: recipient.email,
          audiences: recipient.audiences,
          payload: intent,
          providerIdempotencyKey: `notification/${createHash('sha256').update(`${eventId}:${identity}:email`).digest('hex')}`,
        })
        .onConflictDoNothing();
    }
    return true;
  }

  async softDelete(userId: string, id: string) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(notifications)
        .set({ deletedAt: new Date() })
        .where(and(eq(notifications.id, id), visibleNotification(userId)))
        .returning();
      if (row)
        await tx
          .update(states)
          .set({ outcome: 'deleted', updatedAt: new Date() })
          .where(
            and(eq(states.eventId, row.eventId), eq(states.userId, userId)),
          );
      return Boolean(row);
    });
  }
}
