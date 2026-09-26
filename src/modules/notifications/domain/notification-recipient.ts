import { createHash } from 'node:crypto';
import {
  notificationPolicy,
  type NotificationAudience,
  type NotificationEventType,
} from './notification-policy';

export type NotificationRecipient = {
  userId: string | null;
  email: string | null;
  audiences: NotificationAudience[];
};

export function normalizeNotificationEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new Error('Invalid notification destination');
  return normalized;
}

/** Persist hashed email identities so payload cleanup can remove the destination. */
export function notificationRecipientIdentity(
  recipient: NotificationRecipient,
): string {
  if (recipient.userId) return `user:${recipient.userId}`;
  if (!recipient.email) throw new Error('Recipient requires a User or email');
  return `email:${createHash('sha256').update(normalizeNotificationEmail(recipient.email)).digest('hex')}`;
}

export function mergeNotificationRecipients(
  event: NotificationEventType,
  recipients: NotificationRecipient[],
) {
  const merged = new Map<string, NotificationRecipient>();
  for (const recipient of recipients) {
    if (!recipient.audiences.length)
      throw new Error('Recipient requires an audience');
    recipient.audiences.forEach((audience) =>
      notificationPolicy(event, audience),
    );
    const identity = notificationRecipientIdentity(recipient);
    const previous = merged.get(identity);
    // The shopper destination wins even if staff uses another email address.
    const primary = previous?.audiences.includes('customer')
      ? previous
      : recipient;
    merged.set(identity, {
      ...primary,
      // User identity remains valid even with an undeliverable destination;
      // the sender classifies that address without rolling back commerce.
      email: primary.email ? primary.email.trim().toLowerCase() : null,
      audiences: [
        ...new Set([...(previous?.audiences ?? []), ...recipient.audiences]),
      ].sort(),
    });
  }
  return [...merged.values()];
}

export function notificationEmailOwner(
  event: NotificationEventType,
  recipient: NotificationRecipient,
) {
  return event.startsWith('order.') && recipient.audiences.includes('customer')
    ? ('legacy_order' as const)
    : ('notification' as const);
}
