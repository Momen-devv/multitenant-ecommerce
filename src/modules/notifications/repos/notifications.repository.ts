import { NotificationStreamService } from '../services/notification-stream.service';
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
import { and, eq, gt, sql } from 'drizzle-orm';
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
    private readonly stream: NotificationStreamService,
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
    if (
      intent.resource.kind === 'invitation' &&
      recipient.audiences.includes('invitee')
    ) {
      const st = schema.invitationNotificationState;
      const [state] = await tx
        .select({
          boundUserId: st.boundUserId,
          status: st.status,
          valid: gt(st.expiresAt, sql<Date>`statement_timestamp()`).mapWith(
            Boolean,
          ),
        })
        .from(st)
        .where(eq(st.invitationId, intent.resource.id))
        .for('update');
      if (
        !recipient.userId &&
        state?.boundUserId &&
        state.status === 'pending' &&
        state.valid
      ) {
        const u = schema.user;
        const verified = await tx
          .select({ id: u.id })
          .from(u)
          .innerJoin(st, eq(st.boundUserId, u.id))
          .where(
            and(
              eq(st.invitationId, intent.resource.id),
              eq(u.emailVerified, true),
              eq(sql<string>`lower(trim(${u.email}))`, st.normalizedEmail),
            ),
          )
          .limit(1);
        if (verified.length)
          recipient = { ...recipient, userId: state.boundUserId };
      }
    }
    const now = new Date();
    if (now.getTime() >= intent.occurredAt.getTime() + 180 * 86400000) {
      throw new Error('Notification is outside the supported replay period');
    }
    const expired =
      now.getTime() >= intent.occurredAt.getTime() + 90 * 86400000;
    // A deleted recipient must advance progress without violating inbox FKs.
    const account = recipient.userId
      ? (
          await tx
            .select({ id: schema.user.id })
            .from(schema.user)
            .where(eq(schema.user.id, recipient.userId))
        )[0]
      : null;
    const removed = Boolean(recipient.userId && !account);
    const [claimed] = await tx
      .insert(states)
      .values({
        eventId,
        recipientIdentity: identity,
        userId: recipient.userId,
        audiences: recipient.audiences,
        occurredAt: intent.occurredAt,
        outcome: removed
          ? 'suppressed'
          : expired
            ? 'expired'
            : recipient.userId
              ? 'materialized'
              : 'pending_binding',
        materializedAt: recipient.userId && !expired && !removed ? now : null,
      })
      .onConflictDoNothing()
      .returning({ id: states.id });
    // Tombstone takes precedence over any attempt to reconstruct cleaned history.
    if (!claimed) return null;
    if (recipient.userId && !expired && !removed)
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
      !removed &&
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
    return recipient.userId && !expired && !removed ? recipient.userId : null;
  }

  async softDelete(userId: string, id: string) {
    const deleted = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(notifications)
        .set({ deletedAt: new Date() })
        .where(and(eq(notifications.id, id), visibleNotification(tx, userId)))
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
    if (deleted) await this.stream.publish(userId);
    return deleted;
  }
}
