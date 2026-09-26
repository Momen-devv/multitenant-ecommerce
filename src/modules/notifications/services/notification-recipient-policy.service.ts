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
    if (intent.resource.kind === 'invitation') {
      const result = await this.db.execute<{
        status: string;
        valid: boolean;
        inviter_user_id: string;
        normalized_email: string | null;
        bound_user_id: string | null;
      }>(sql`select status, expires_at > now() as valid, inviter_user_id,
        normalized_email, bound_user_id from invitation_notification_state
        where invitation_id = ${intent.resource.id} and store_id = ${intent.storeId}`);
      const state = result.rows[0];
      if (!state) return [];
      if (
        ['invitation.created', 'invitation.reminder'].includes(
          intent.eventType,
        ) &&
        (state.status !== 'pending' || !state.valid)
      )
        return [];
      if (
        recipient.audiences.includes('invitee') &&
        recipient.email?.trim().toLowerCase() !== state.normalized_email
      )
        return [];
      if (!recipient.userId) {
        // Email-only invitees are intentional; inbox binding still requires verification.
        if (state.bound_user_id) {
          recipient.userId = state.bound_user_id;
        } else {
          const [matching] = await this.db
            .select()
            .from(schema.user)
            .where(
              sql`lower(trim(${schema.user.email})) = ${state.normalized_email}`,
            );
          if (
            matching &&
            (!matching.isActive ||
              (matching.banned &&
                (!matching.banExpires ||
                  matching.banExpires.getTime() > Date.now())))
          )
            return [];
          // Resolve pending send preferences even before the next binding scan.
          // Terminal email intents cannot associate a later account through reuse.
          if (
            matching?.emailVerified &&
            state.status === 'pending' &&
            state.valid
          )
            recipient.userId = matching.id;
          else
            return recipient.audiences.filter((reason) => reason === 'invitee');
        }
      }
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
      return recipient.audiences.filter(
        (reason) =>
          (reason === 'inviter' && state.inviter_user_id === account.id) ||
          (reason === 'invitee' &&
            (state.bound_user_id === account.id ||
              (!state.bound_user_id &&
                state.status === 'pending' &&
                state.valid)) &&
            account.emailVerified &&
            account.email.trim().toLowerCase() === state.normalized_email),
      );
    }
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
