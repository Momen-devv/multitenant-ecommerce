import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import type { NotificationRecipient } from '../domain/notification-recipient';
import type { NotificationIntent } from '../domain/notification-event';
import { orderReadRoles } from '../domain/order-read-roles';

@Injectable()
export class NotificationRecipientPolicyService {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async eligibleAudiences(
    recipient: NotificationRecipient,
    intent: NotificationIntent,
  ) {
    if (!recipient.userId) return [];
    const [account] = await this.db
      .select()
      .from(schema.user)
      .where(
        and(
          eq(schema.user.id, recipient.userId),
          eq(schema.user.isActive, true),
          sql`(${schema.user.banned} is not true or ${schema.user.banExpires} <= now())`,
        ),
      );
    if (!account) return [];
    const eligible: NotificationRecipient['audiences'] = [];
    for (const audience of recipient.audiences) {
      if (
        audience === 'admin' &&
        account.role?.split(',').includes('platformSuperAdmin')
      )
        eligible.push(audience);
      if (audience === 'customer') {
        const [order] = await this.db
          .select({ id: schema.orders.id })
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.id, intent.resource.id),
              eq(schema.orders.userId, account.id),
              intent.storeId
                ? eq(schema.orders.storeId, intent.storeId)
                : sql`false`,
            ),
          );
        if (order) eligible.push(audience);
      }
      if (audience === 'staff' && intent.storeId) {
        const [membership] = await this.db
          .select({ id: schema.member.id })
          .from(schema.member)
          .innerJoin(
            schema.store,
            eq(schema.store.organizationId, schema.member.organizationId),
          )
          .where(
            and(
              eq(schema.store.id, intent.storeId),
              eq(schema.member.userId, account.id),
              sql`string_to_array(${schema.member.role}, ',') && ${sql.param(orderReadRoles)}::text[]`,
            ),
          );
        if (membership) eligible.push(audience);
      }
    }
    return eligible;
  }
}
