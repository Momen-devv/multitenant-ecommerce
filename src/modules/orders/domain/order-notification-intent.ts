import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import { orders } from '@/infrastructure/database/schema/orders.schema';
import { orderReadRoles } from '@/modules/notifications/domain/order-read-roles';
import { writeNotificationIntent } from '@/infrastructure/outbox/notification-intent.writer';
type Database = NodePgDatabase<typeof schema>;

/** Snapshot membership alongside the Order transition, never during fan-out. */
export async function writeOrderNotificationIntent(
  tx: Database,
  order: typeof orders.$inferSelect,
  transition: 'placed' | 'shipped' | 'delivered' | 'cancelled' | 'refunded',
) {
  const staff = await tx
    .select({ userId: schema.user.id, email: schema.user.email })
    .from(schema.member)
    .innerJoin(
      schema.store,
      eq(schema.store.organizationId, schema.member.organizationId),
    )
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(
      and(
        eq(schema.store.id, order.storeId),
        sql`string_to_array(${schema.member.role}, ',') && ${sql.param(orderReadRoles)}::text[]`,
      ),
    );
  await writeNotificationIntent(tx, {
    sourceKey: `order:${order.id}:${order.version}:${transition}`,
    eventType: `order.${transition}`,
    aggregateId: order.id,
    aggregateVersion: order.version,
    storeId: order.storeId,
    payloadVersion: 1,
    occurredAt: order.updatedAt,
    recipients: [
      ...(order.userId
        ? [
            {
              userId: order.userId,
              email: order.accountEmail,
              audiences: ['customer' as const],
            },
          ]
        : []),
      ...staff.map((recipient) => ({
        ...recipient,
        audiences: ['staff' as const],
      })),
    ],
    display: {
      title: `Order ${transition}`,
      body: `Your Order has been ${transition}.`,
    },
    resource: { kind: 'order', id: order.id },
  });
}
