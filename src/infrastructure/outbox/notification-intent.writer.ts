import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import { outboxEvents } from '@/infrastructure/database/schema/outbox.schema';
import { OutboxEventType } from '@/common/enums';
import {
  NOTIFICATION_INTENT_COMMITTED,
  type NotificationIntentCommitted,
} from '@/common/events/notification-intent-committed.event';
import type { NotificationIntent } from '@/modules/notifications/domain/notification-event';

type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const committedSources = new WeakMap<object, string[]>();

/** Local hints run only after commit. Polling remains authoritative. */
export async function notificationTransaction<T>(
  db: Database,
  emitter: EventEmitter2,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const sources: string[] = [];
  const result = await db.transaction(async (tx) => {
    committedSources.set(tx, sources);
    try {
      return await work(tx);
    } finally {
      committedSources.delete(tx);
    }
  });
  for (const sourceId of sources) {
    try {
      emitter.emit(NOTIFICATION_INTENT_COMMITTED, {
        sourceId,
      } satisfies NotificationIntentCommitted);
    } catch {
      /* A failed hint cannot change an already committed domain result. */
    }
  }
  return result;
}

export async function writeNotificationIntent(
  tx: Database,
  value: NotificationIntent,
) {
  const intent = value;
  const [row] = await tx
    .insert(outboxEvents)
    .values({
      eventType: OutboxEventType.NOTIFICATION_INTENT,
      aggregateId: intent.aggregateId,
      deduplicationKey: intent.sourceKey,
      payload: intent,
    })
    .onConflictDoNothing()
    .returning({ id: outboxEvents.id });
  if (row) committedSources.get(tx)?.push(row.id);
}
