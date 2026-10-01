import { NotificationStreamService } from '../services/notification-stream.service';
import { NOTIFICATION_INBOX_RETENTION_MS } from '../domain/notification-retention';
import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  and,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { LoggerService } from '@/infrastructure/logger/logger.service';

@Injectable()
export class InvitationNotificationReconciliationTask {
  private running = false;
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly stream: NotificationStreamService,
    private readonly logger: LoggerService,
  ) {}

  @Interval('invitation-notification-reconciliation', 30_000)
  async reconcile() {
    if (this.running) return;
    this.running = true;
    try {
      const users = new Set<string>();
      await this.db.transaction(async (tx) => {
        const {
          invitation: i,
          invitationNotificationState: st,
          user: u,
          notificationEvents: e,
          notificationRecipientStates: rs,
          notifications: inbox,
        } = schema;
        const now = sql<Date>`now()`;
        const reminderCutoff = sql<Date>`now() - interval '3 days'`;
        const verifiedEmail = and(
          eq(u.emailVerified, true),
          eq(sql<string>`lower(trim(${u.email}))`, st.normalizedEmail),
        );
        // Lock in the same order as auth writes: invitation then lifecycle state.
        // Only due work participates, so old unresolved addresses cannot starve it.
        const due = await tx
          .select({ id: i.id })
          .from(i)
          .innerJoin(st, eq(st.invitationId, i.id))
          .where(
            and(
              eq(i.status, 'pending'),
              eq(st.status, 'pending'),
              or(
                lte(i.expiresAt, now),
                and(
                  isNull(st.reminderRecordedAt),
                  lte(st.createdAt, reminderCutoff),
                ),
                and(
                  isNull(st.boundUserId),
                  exists(tx.select({ id: u.id }).from(u).where(verifiedEmail)),
                ),
              ),
            ),
          )
          .orderBy(i.expiresAt, i.id)
          .limit(100)
          .for('update', { of: i, skipLocked: true });
        for (const { id } of due) {
          await tx
            .select({ id: st.invitationId })
            .from(st)
            .where(eq(st.invitationId, id))
            .for('update');
          const expired = await tx
            .update(st)
            .set({ status: 'expired', outcomeRecordedAt: now, updatedAt: now })
            .where(
              and(
                eq(st.invitationId, id),
                eq(st.status, 'pending'),
                lte(st.expiresAt, now),
              ),
            )
            .returning({ id: st.invitationId });
          if (expired.length) {
            // Reuse the migration-owned lifecycle writer used by auth triggers.
            await tx
              .select({
                recorded: sql`record_invitation_notification(${id}, 'expired')`,
              })
              .from(st)
              .where(eq(st.invitationId, id));
            continue;
          }
          // Bind only while pending and valid. An expired address can never claim history.
          await tx
            .update(st)
            .set({ boundUserId: u.id, updatedAt: now })
            .from(u)
            .where(
              and(
                eq(st.invitationId, id),
                eq(st.status, 'pending'),
                gt(st.expiresAt, now),
                isNull(st.boundUserId),
                verifiedEmail,
              ),
            );
          // Association is independent of email success and event processing status.
          // Preserve email recipient identity and tombstones; never create delivery work here.
          const bound = await tx
            .update(rs)
            .set({
              userId: st.boundUserId,
              outcome: 'materialized',
              materializedAt: now,
              updatedAt: now,
            })
            .from(e)
            .innerJoin(st, eq(e.aggregateId, st.invitationId))
            .innerJoin(u, eq(st.boundUserId, u.id))
            .where(
              and(
                eq(st.invitationId, id),
                eq(st.status, 'pending'),
                gt(st.expiresAt, now),
                verifiedEmail,
                inArray(e.eventType, [
                  'invitation.created',
                  'invitation.reminder',
                ]),
                eq(rs.eventId, e.id),
                eq(rs.outcome, 'pending_binding'),
                gt(
                  rs.occurredAt,
                  sql`now() - ${NOTIFICATION_INBOX_RETENTION_MS} * interval '1 millisecond'`,
                ),
              ),
            )
            .returning({
              eventId: rs.eventId,
              userId: rs.userId,
              audiences: rs.audiences,
              occurredAt: rs.occurredAt,
              storeId: e.storeId,
              type: e.eventType,
              payload: e.payload,
            });
          const rows: (typeof inbox.$inferInsert)[] = bound.flatMap((row) =>
            row.userId && row.payload
              ? [
                  {
                    eventId: row.eventId,
                    recipientUserId: row.userId,
                    audiences: row.audiences,
                    occurredAt: row.occurredAt,
                    storeId: row.storeId,
                    type: row.type,
                    display: row.payload.display,
                    resource: row.payload.resource,
                  },
                ]
              : [],
          );
          if (rows.length) {
            const inserted = await tx
              .insert(inbox)
              .values(rows)
              .onConflictDoNothing()
              .returning({ userId: inbox.recipientUserId });
            for (const row of inserted) users.add(row.userId);
          }
          const reminder = await tx
            .update(st)
            .set({ reminderRecordedAt: now, updatedAt: now })
            .where(
              and(
                eq(st.invitationId, id),
                eq(st.status, 'pending'),
                gt(st.expiresAt, now),
                isNull(st.reminderRecordedAt),
                lte(st.createdAt, reminderCutoff),
              ),
            )
            .returning({ id: st.invitationId });
          if (reminder.length)
            await tx
              .select({
                recorded: sql`record_invitation_notification(${id}, 'reminder')`,
              })
              .from(st)
              .where(eq(st.invitationId, id));
        }
      });
      await Promise.all([...users].map((id) => this.stream.publish(id)));
    } catch {
      this.logger.error(
        'Invitation notification reconciliation failed',
        undefined,
        InvitationNotificationReconciliationTask.name,
      );
    } finally {
      this.running = false;
    }
  }
}
