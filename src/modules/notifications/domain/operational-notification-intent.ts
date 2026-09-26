import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import { writeNotificationIntent } from '@/infrastructure/outbox/notification-intent.writer';
type Database = NodePgDatabase<typeof schema>;

/** No payloads/secrets or provider errors are exposed to administrators. */
export async function writeOperationalNotificationIntent(
  tx: Database,
  sourceKey: string,
  aggregateId: string,
  eventType: 'order.intervention_required' | 'notification.delivery_failed',
) {
  const admins = await tx
    .select({ userId: schema.user.id, email: schema.user.email })
    .from(schema.user)
    .where(
      sql`'platformSuperAdmin' = any(string_to_array(${schema.user.role}, ','))`,
    );
  await writeNotificationIntent(tx, {
    sourceKey,
    eventType,
    aggregateId,
    aggregateVersion: 1,
    storeId: null,
    payloadVersion: 1,
    occurredAt: new Date(),
    recipients: admins.map((recipient) => ({
      ...recipient,
      audiences: ['admin'],
    })),
    display: {
      title: 'Operations intervention required',
      body:
        eventType === 'notification.delivery_failed'
          ? 'A notification could not be delivered. Review the durable delivery record.'
          : 'An Order payment or refund requires operator review.',
    },
    resource: { kind: 'operations', id: aggregateId },
  });
}
