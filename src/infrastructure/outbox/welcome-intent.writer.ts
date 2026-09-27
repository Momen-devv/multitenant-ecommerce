import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import type { NotificationIntent } from '@/modules/notifications/domain/notification-event';
import { writeNotificationIntent } from './notification-intent.writer';

type Database = NodePgDatabase<typeof schema>;

/** Lifetime milestone and intent must commit together, independently of retention. */
export async function writeWelcomeIntent(
  tx: Database,
  intent: NotificationIntent,
) {
  const rollout =
    await tx.execute(sql`select 1 from notification_registration_rollout
    where id = 'welcome-v1' and activated_at <= ${intent.occurredAt}`);
  if (!rollout.rows.length) return;
  const [milestone] = await tx
    .insert(schema.notificationMilestones)
    .values({
      sourceKey: intent.sourceKey,
      eventType: intent.eventType,
      aggregateId: intent.aggregateId,
      occurredAt: intent.occurredAt,
    })
    .onConflictDoNothing()
    .returning();
  if (milestone) await writeNotificationIntent(tx, intent);
}

export async function captureRegisteredUser(db: Database, id: string) {
  await db.transaction(async (tx) => {
    const account = await tx.query.user.findFirst({
      where: eq(schema.user.id, id),
    });
    if (!account) return;
    await writeWelcomeIntent(tx, {
      sourceKey: `user:${id}:registered`,
      eventType: 'user.registered',
      aggregateId: id,
      aggregateVersion: 1,
      storeId: null,
      payloadVersion: 1,
      occurredAt: account.createdAt,
      // Verification reconciliation owns the only account welcome delivery.
      recipients: [{ userId: id, email: null, audiences: ['user'] }],
      display: {
        title: 'Welcome!',
        body: 'Thank you for joining our e-commerce platform.',
      },
      resource: { kind: 'account', id },
      accountName: account.name,
    });
  });
}
