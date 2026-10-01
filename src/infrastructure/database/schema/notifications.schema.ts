import { generateUUIDv7 } from '@/common/utils/uuidv7';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { store } from './app.schema';
import type { NotificationIntent } from '@/modules/notifications/domain/notification-event';
import type {
  NotificationAudience,
  NotificationEventType,
} from '@/modules/notifications/domain/notification-policy';
import type { NotificationRecipient } from '@/modules/notifications/domain/notification-recipient';

export const notificationEventStatus = pgEnum('notification_event_status', [
  'pending',
  'processing',
  'processed',
  'dead_lettered',
]);
export const notificationDeliveryStatus = pgEnum(
  'notification_delivery_status',
  [
    'pending',
    'sending',
    'sent',
    'suppressed',
    'dead_lettered',
    'review_required',
  ],
);
export const notificationRecipientOutcome = pgEnum(
  'notification_recipient_outcome',
  ['pending_binding', 'materialized', 'expired', 'suppressed', 'deleted'],
);
const at = (name: string) => timestamp(name, { withTimezone: true });

export const notificationEvents = pgTable(
  'notification_events',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    sourceKey: varchar('source_key', { length: 255 }).notNull(),
    eventType: varchar('event_type', { length: 80 })
      .$type<NotificationEventType>()
      .notNull(),
    aggregateId: varchar('aggregate_id', { length: 255 }).notNull(),
    aggregateVersion: integer('aggregate_version').notNull(),
    // Source references survive Store/User removal and payload cleanup.
    storeId: uuid('store_id'),
    payloadVersion: integer('payload_version').notNull(),
    payload: jsonb('payload').$type<NotificationIntent>(),
    audienceSnapshot:
      jsonb('audience_snapshot').$type<NotificationRecipient[]>(),
    occurredAt: at('occurred_at').notNull(),
    status: notificationEventStatus('status').notNull().default('pending'),
    fanoutProgress: integer('fanout_progress').notNull().default(0),
    recipientCount: integer('recipient_count').notNull(),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: at('lease_expires_at'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: at('next_attempt_at').notNull().defaultNow(),
    lastQueuedAt: at('last_queued_at'),
    enqueueGeneration: integer('enqueue_generation').notNull().default(0),
    processedAt: at('processed_at'),
    deadLetteredAt: at('dead_lettered_at'),
    deadLetterReason: varchar('dead_letter_reason', { length: 1000 }),
    lastError: varchar('last_error', { length: 1000 }),
    createdAt: at('created_at').notNull().defaultNow(),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notification_events_source_uidx').on(t.sourceKey),
    index('notification_events_due_idx').on(
      t.status,
      t.nextAttemptAt,
      t.storeId,
      t.occurredAt,
    ),
    index('notification_events_lease_idx').on(t.status, t.leaseExpiresAt),
    check(
      'notification_events_progress_check',
      sql`${t.fanoutProgress} >= 0 AND ${t.fanoutProgress} <= ${t.recipientCount} AND ${t.attempts} >= 0 AND ${t.enqueueGeneration} >= 0 AND ${t.aggregateVersion} > 0 AND ${t.payloadVersion} > 0`,
    ),
  ],
);

export const notificationRecipientStates = pgTable(
  'notification_recipient_states',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    eventId: uuid('event_id')
      .notNull()
      .references(() => notificationEvents.id, { onDelete: 'restrict' }),
    recipientIdentity: text('recipient_identity').notNull(),
    userId: text('user_id'),
    audiences: jsonb('audiences').$type<NotificationAudience[]>().notNull(),
    outcome: notificationRecipientOutcome('outcome').notNull(),
    occurredAt: at('occurred_at').notNull(),
    materializedAt: at('materialized_at'),
    createdAt: at('created_at').notNull().defaultNow(),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notification_recipient_states_identity_uidx').on(
      t.eventId,
      t.recipientIdentity,
    ),
    uniqueIndex('notification_recipient_states_user_uidx')
      .on(t.eventId, t.userId)
      .where(sql`${t.userId} IS NOT NULL`),
    index('notification_recipient_states_binding_idx').on(
      t.outcome,
      t.occurredAt,
    ),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    eventId: uuid('event_id')
      .notNull()
      .references(() => notificationEvents.id, { onDelete: 'restrict' }),
    recipientUserId: text('recipient_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    audiences: jsonb('audiences').$type<NotificationAudience[]>().notNull(),
    storeId: uuid('store_id'),
    type: varchar('type', { length: 80 })
      .$type<NotificationEventType>()
      .notNull(),
    display: jsonb('display').$type<NotificationIntent['display']>().notNull(),
    resource: jsonb('resource')
      .$type<NotificationIntent['resource']>()
      .notNull(),
    occurredAt: at('occurred_at').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
    readAt: at('read_at'),
    archivedAt: at('archived_at'),
    deletedAt: at('deleted_at'),
  },
  (t) => [
    uniqueIndex('notifications_event_user_uidx').on(
      t.eventId,
      t.recipientUserId,
    ),
    index('notifications_recipient_cursor_idx').on(
      t.recipientUserId,
      t.occurredAt,
      t.id,
    ),
    index('notifications_store_cursor_idx').on(
      t.recipientUserId,
      t.storeId,
      t.occurredAt,
      t.id,
    ),
    index('notifications_unread_idx')
      .on(t.recipientUserId, t.storeId)
      .where(
        sql`${t.readAt} IS NULL AND ${t.archivedAt} IS NULL AND ${t.deletedAt} IS NULL`,
      ),
  ],
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').references(() => store.id, {
      onDelete: 'cascade',
    }),
    eventType: varchar('event_type', { length: 80 })
      .$type<NotificationEventType>()
      .notNull(),
    audience: varchar('audience', { length: 32 })
      .$type<NotificationAudience>()
      .notNull(),
    emailEnabled: boolean('email_enabled').notNull(),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notification_preferences_global_uidx')
      .on(t.userId, t.eventType, t.audience)
      .where(sql`${t.storeId} IS NULL`),
    uniqueIndex('notification_preferences_store_uidx')
      .on(t.userId, t.storeId, t.eventType, t.audience)
      .where(sql`${t.storeId} IS NOT NULL`),
  ],
);

export const notificationEmailDeliveries = pgTable(
  'notification_email_deliveries',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    eventId: uuid('event_id')
      .notNull()
      .references(() => notificationEvents.id, { onDelete: 'restrict' }),
    recipientIdentity: text('recipient_identity').notNull(),
    recipientUserId: text('recipient_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    recipientEmail: text('recipient_email'),
    audiences: jsonb('audiences').$type<NotificationAudience[]>().notNull(),
    channel: varchar('channel', { length: 16 }).notNull().default('email'),
    payload: jsonb('payload').$type<NotificationIntent>(),
    providerIdempotencyKey: varchar('provider_idempotency_key', {
      length: 255,
    }).notNull(),
    providerMessageId: text('provider_message_id'),
    status: notificationDeliveryStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: at('lease_expires_at'),
    nextAttemptAt: at('next_attempt_at').notNull().defaultNow(),
    lastQueuedAt: at('last_queued_at'),
    enqueueGeneration: integer('enqueue_generation').notNull().default(0),
    providerDispatchedAt: at('provider_dispatched_at'),
    sentAt: at('sent_at'),
    suppressedAt: at('suppressed_at'),
    suppressionReason: varchar('suppression_reason', { length: 255 }),
    deadLetteredAt: at('dead_lettered_at'),
    deadLetterReason: varchar('dead_letter_reason', { length: 1000 }),
    lastError: varchar('last_error', { length: 1000 }),
    createdAt: at('created_at').notNull().defaultNow(),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notification_deliveries_identity_uidx').on(
      t.eventId,
      t.recipientIdentity,
      t.channel,
    ),
    uniqueIndex('notification_deliveries_provider_key_uidx').on(
      t.providerIdempotencyKey,
    ),
    index('notification_deliveries_due_idx').on(t.status, t.nextAttemptAt),
    index('notification_deliveries_lease_idx').on(t.status, t.leaseExpiresAt),
    check(
      'notification_deliveries_channel_check',
      sql`${t.channel} = 'email' AND ${t.attempts} >= 0 AND ${t.enqueueGeneration} >= 0`,
    ),
  ],
);

/** Lifetime source milestones are independent of inbox/event retention. */
export const notificationMilestones = pgTable('notification_milestones', {
  sourceKey: varchar('source_key', { length: 255 }).primaryKey(),
  eventType: varchar('event_type', { length: 80 })
    .$type<NotificationEventType>()
    .notNull(),
  aggregateId: text('aggregate_id').notNull(),
  occurredAt: at('occurred_at').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

/** Trigger-owned lifecycle ledger; survives deletion of the auth invitation. */
export const invitationNotificationState = pgTable(
  'invitation_notification_state',
  {
    invitationId: text('invitation_id').primaryKey(),
    storeId: uuid('store_id').notNull(),
    inviterUserId: text('inviter_user_id').notNull(),
    normalizedEmail: text('normalized_email'),
    boundUserId: text('bound_user_id'),
    status: varchar('status', { length: 32 }).notNull(),
    expiresAt: at('expires_at').notNull(),
    reminderEventId: uuid('reminder_event_id'),
    reminderRecordedAt: at('reminder_recorded_at'),
    outcomeRecordedAt: at('outcome_recorded_at'),
    resendGeneration: integer('resend_generation').notNull().default(0),
    lastResentAt: at('last_resent_at'),
    createdAt: at('created_at').notNull().defaultNow(),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('invitation_notifications_discovery_idx').on(t.status, t.expiresAt),
    check(
      'invitation_notifications_generation_check',
      sql`${t.resendGeneration} >= 0`,
    ),
  ],
);

/** Persisted rollout cutoff; migration seeds lifetime baselines before writes. */
export const notificationRegistrationRollout = pgTable(
  'notification_registration_rollout',
  {
    id: text('id').primaryKey(),
    activatedAt: at('activated_at')
      .notNull()
      .default(sql`clock_timestamp()`),
  },
);
