import { z } from 'zod';
import {
  notificationCatalog,
  notificationPolicy,
  type NotificationEventType,
} from './notification-policy';
import { mergeNotificationRecipients } from './notification-recipient';

const audience = z.enum([
  'user',
  'customer',
  'staff',
  'storeOwner',
  'invitee',
  'inviter',
  'admin',
]);
export const notificationIntentSchema = z
  .object({
    sourceKey: z.string().min(1).max(255),
    eventType: z.custom<NotificationEventType>(
      (value) =>
        typeof value === 'string' && Object.hasOwn(notificationCatalog, value),
    ),
    aggregateId: z.string().min(1).max(255),
    aggregateVersion: z.number().int().positive(),
    storeId: z.uuid().nullable(),
    payloadVersion: z.literal(1),
    occurredAt: z.coerce.date(),
    recipients: z.array(
      z.object({
        userId: z.string().min(1).nullable(),
        email: z.string().nullable(),
        audiences: z.array(audience).min(1),
      }),
    ),
    display: z
      .object({ title: z.string().min(1).max(200), body: z.string().max(1000) })
      .strict(),
    resource: z
      .object({
        kind: z.enum([
          'order',
          'invitation',
          'store',
          'subscription',
          'account',
          'operations',
        ]),
        id: z.string().min(1).max(255),
      })
      .strict(),
  })
  .strict()
  .superRefine((intent, ctx) => {
    for (const recipient of intent.recipients) {
      if (
        !recipient.userId &&
        recipient.audiences.some((reason) => reason !== 'invitee')
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Only invitees can be email-only recipients',
        });
      }
      for (const reason of recipient.audiences) {
        try {
          const policy = notificationPolicy(intent.eventType, reason);
          if (reason === 'user' && intent.storeId)
            throw new Error('Global event cannot carry a Store');
          if (policy.storeScoped && !intent.storeId)
            throw new Error('Store event requires a Store');
        } catch (error) {
          ctx.addIssue({
            code: 'custom',
            message:
              error instanceof Error ? error.message : 'Invalid audience',
          });
        }
      }
    }
  });
export type NotificationIntent = z.infer<typeof notificationIntentSchema>;

export function parseNotificationIntent(value: unknown): NotificationIntent {
  const intent = notificationIntentSchema.parse(value);
  return {
    ...intent,
    recipients: mergeNotificationRecipients(
      intent.eventType,
      intent.recipients,
    ),
  };
}
