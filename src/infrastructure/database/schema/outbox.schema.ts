import { OutboxEventType } from '@/common/enums/outbox-event-type.enum';
import { generateUUIDv7 } from '@/common/utils/uuidv7';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const outboxEventTypeEnum = pgEnum('outbox_event_type', [
  OutboxEventType.PLAN_PROVISIONING_REQUESTED,
]);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().$defaultFn(generateUUIDv7),
    eventType: outboxEventTypeEnum('event_type').notNull(),
    aggregateId: varchar('aggregate_id', { length: 255 }).notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    deduplicationKey: varchar('deduplication_key', {
      length: 255,
    }).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: varchar('last_error', { length: 1000 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('outbox_events_type_deduplication_uidx').on(
      table.eventType,
      table.deduplicationKey,
    ),
    index('outbox_events_due_idx').on(
      table.eventType,
      table.publishedAt,
      table.deadLetteredAt,
      table.availableAt,
    ),
  ],
);
