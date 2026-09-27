import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
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
      if (!intent.storeId) return [];
      const st = schema.invitationNotificationState;
      const [state] = await this.db
        .select({
          status: st.status,
          valid: gt(st.expiresAt, sql`now()`).mapWith(Boolean),
          inviterUserId: st.inviterUserId,
          normalizedEmail: st.normalizedEmail,
          boundUserId: st.boundUserId,
        })
        .from(st)
        .where(
          and(
            eq(st.invitationId, intent.resource.id),
            eq(st.storeId, intent.storeId),
          ),
        );
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
        recipient.email?.trim().toLowerCase() !== state.normalizedEmail
      )
        return [];
      if (!recipient.userId) {
        // Email-only invitees are intentional; inbox binding still requires verification.
        if (state.boundUserId) {
          recipient.userId = state.boundUserId;
        } else {
          const [matching] = await this.db
            .select()
            .from(schema.user)
            .where(
              sql`lower(trim(${schema.user.email})) = ${state.normalizedEmail}`,
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
            or(
              eq(schema.user.banned, false),
              isNull(schema.user.banned),
              lte(schema.user.banExpires, sql`now()`),
            ),
          ),
        );
      if (!account) return [];
      return recipient.audiences.filter(
        (reason) =>
          (reason === 'inviter' && state.inviterUserId === account.id) ||
          (reason === 'invitee' &&
            (state.boundUserId === account.id ||
              (!state.boundUserId &&
                state.status === 'pending' &&
                state.valid)) &&
            account.emailVerified &&
            account.email.trim().toLowerCase() === state.normalizedEmail),
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
          or(
            eq(schema.user.banned, false),
            isNull(schema.user.banned),
            lte(schema.user.banExpires, sql`now()`),
          ),
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
      if (
        audience === 'user' &&
        intent.resource.kind === 'account' &&
        intent.resource.id === account.id &&
        account.emailVerified &&
        account.email.trim().toLowerCase() ===
          recipient.email?.trim().toLowerCase()
      )
        eligible.push(audience);
      if (audience === 'storeOwner' && intent.storeId) {
        const ownerStore = await this.db.query.store.findFirst({
          where: and(
            eq(schema.store.id, intent.storeId),
            eq(schema.store.ownerId, account.id),
          ),
        });
        if (ownerStore) eligible.push(audience);
      }
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
