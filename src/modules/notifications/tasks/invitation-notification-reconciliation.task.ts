import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { LoggerService } from '@/infrastructure/logger/logger.service';

@Injectable()
export class InvitationNotificationReconciliationTask {
  private running = false;
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly logger: LoggerService,
  ) {}

  @Interval('invitation-notification-reconciliation', 30_000)
  async reconcile() {
    if (this.running) return;
    this.running = true;
    try {
      await this.db.transaction(async (tx) => {
        // Lock in the same order as auth writes: invitation then lifecycle state.
        // Only due work participates, so old unresolved addresses cannot starve it.
        const due = await tx.execute<{ id: string }>(sql`
          select i.id from invitation i join invitation_notification_state st on st.invitation_id = i.id
          where i.status = 'pending' and st.status = 'pending' and (
            i.expires_at <= now()
            or (st.reminder_recorded_at is null and st.created_at <= now() - interval '3 days')
            or (st.bound_user_id is null and exists (select 1 from "user" u where u.email_verified
              and lower(trim(u.email)) = st.normalized_email)))
          order by i.expires_at, i.id limit 100 for update of i skip locked`);
        for (const { id } of due.rows) {
          await tx.execute(
            sql`select 1 from invitation_notification_state where invitation_id = ${id} for update`,
          );
          const expired =
            await tx.execute(sql`update invitation_notification_state
            set status = 'expired', outcome_recorded_at = now(), updated_at = now()
            where invitation_id = ${id} and status = 'pending' and expires_at <= now() returning invitation_id`);
          if (expired.rows.length) {
            await tx.execute(
              sql`select record_invitation_notification(${id}, 'expired')`,
            );
            continue;
          }
          // Bind only while pending and valid. An expired address can never claim history.
          await tx.execute(sql`update invitation_notification_state st set bound_user_id = u.id, updated_at = now()
            from "user" u where st.invitation_id = ${id} and st.status = 'pending' and st.expires_at > now()
              and st.bound_user_id is null and u.email_verified and lower(trim(u.email)) = st.normalized_email`);
          // Association is independent of email success and event processing status.
          // Preserve email recipient identity and tombstones; never create delivery work here.
          await tx.execute(sql`with bound as (
            update notification_recipient_states rs set user_id = st.bound_user_id,
              outcome = 'materialized', materialized_at = now(), updated_at = now()
            from notification_events e, invitation_notification_state st, "user" u
            where st.invitation_id = ${id} and st.status = 'pending' and st.expires_at > now()
              and st.bound_user_id = u.id and u.email_verified and lower(trim(u.email)) = st.normalized_email
              and e.aggregate_id = st.invitation_id and e.event_type in ('invitation.created','invitation.reminder')
              and rs.event_id = e.id and rs.outcome = 'pending_binding'
              and rs.occurred_at > now() - interval '90 days'
            returning rs.event_id, rs.user_id, rs.audiences, rs.occurred_at)
            insert into notifications(id, event_id, recipient_user_id, audiences, store_id, type, display, resource, occurred_at)
            select gen_random_uuid(), b.event_id, b.user_id, b.audiences, e.store_id, e.event_type,
              e.payload->'display', e.payload->'resource', b.occurred_at
            from bound b join notification_events e on e.id = b.event_id where e.payload is not null
            on conflict do nothing`);
          const reminder =
            await tx.execute(sql`update invitation_notification_state
            set reminder_recorded_at = now(), updated_at = now()
            where invitation_id = ${id} and status = 'pending' and expires_at > now()
              and reminder_recorded_at is null and created_at <= now() - interval '3 days'
            returning invitation_id`);
          if (reminder.rows.length)
            await tx.execute(
              sql`select record_invitation_notification(${id}, 'reminder')`,
            );
        }
      });
    } catch (error) {
      this.logger.error(
        'Invitation notification reconciliation failed',
        error instanceof Error ? error.stack : undefined,
        InvitationNotificationReconciliationTask.name,
      );
    } finally {
      this.running = false;
    }
  }
}
