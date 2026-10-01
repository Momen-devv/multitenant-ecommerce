import { sha256Hex } from '@/common/utils';
import * as schema from '@/infrastructure/database/schema/schema';
import {
  notifications,
  notificationRecipientStates as states,
  notificationEmailDeliveries as deliveries,
} from '@/infrastructure/database/schema/notifications.schema';
import { Injectable } from '@nestjs/common';
import { and, eq, gt, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { NotificationIntent } from '../domain/notification-event';
import {
  NOTIFICATION_INBOX_RETENTION_MS,
  NOTIFICATION_METADATA_RETENTION_MS,
} from '../domain/notification-retention';
import { notificationPolicy } from '../domain/notification-policy';
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
  /** Called inside the worker's leased checkpoint transaction. No external work.
   * Binding an email-only invitation later is a separate verified-identity operation.
   */
  async materializeRecipient(
    tx: NotificationTransaction,
    eventId: string,
    intent: Readonly<NotificationIntent>,
    recipient: NotificationRecipient,
    emailEnabled: boolean,
  ) {
    // The worker supplies a recipient from the validated, leased event snapshot.
    const identity = notificationRecipientIdentity(recipient);
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
    if (
      now.getTime() >=
      intent.occurredAt.getTime() + NOTIFICATION_METADATA_RETENTION_MS
    ) {
      throw new Error('Notification is outside the supported replay period');
    }
    const expired =
      now.getTime() >=
      intent.occurredAt.getTime() + NOTIFICATION_INBOX_RETENTION_MS;
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
      notificationEmailOwner(intent.eventType, recipient) === 'notification'
    ) {
      await tx
        .insert(deliveries)
        .values({
          eventId,
          recipientIdentity: identity,
          recipientUserId: recipient.userId,
          recipientEmail: recipient.email,
          audiences: recipient.audiences,
          payload: { ...intent, recipients: [recipient] },
          providerIdempotencyKey: `notification/${sha256Hex(`${eventId}:${identity}:email`)}`,
        })
        .onConflictDoNothing();
    }
    return recipient.userId && !expired && !removed ? recipient.userId : null;
  }
}
