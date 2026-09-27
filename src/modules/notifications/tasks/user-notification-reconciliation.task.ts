import { Inject, Injectable } from '@nestjs/common';
import { NOTIFICATION_METADATA_RETENTION_MS } from '../domain/notification-retention';
import { Interval } from '@nestjs/schedule';
import {
  and,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  lte,
  notExists,
  or,
  sql,
} from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { captureRegisteredUser } from '@/infrastructure/outbox/welcome-intent.writer';
import { LoggerService } from '@/infrastructure/logger/logger.service';

@Injectable()
export class UserNotificationReconciliationTask {
  private running = false;
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly logger: LoggerService,
  ) {}

  @Interval('user-notification-reconciliation', 30_000)
  async reconcile() {
    if (this.running) return;
    this.running = true;
    try {
      const {
        user: u,
        notificationRegistrationRollout: r,
        notificationMilestones: m,
        notificationEvents: e,
        notificationEmailDeliveries: d,
      } = schema;
      const accounts = await this.db
        .select({ id: u.id })
        .from(u)
        .innerJoin(r, eq(r.id, 'welcome-v1'))
        .where(
          and(
            gte(u.createdAt, r.activatedAt),
            notExists(
              this.db
                .select({ id: m.sourceKey })
                .from(m)
                .where(
                  eq(m.sourceKey, sql`'user:' || ${u.id} || ':registered'`),
                ),
            ),
          ),
        )
        .orderBy(u.createdAt, u.id)
        .limit(100);
      for (const account of accounts)
        await captureRegisteredUser(this.db, account.id);
      // Email eligibility is independent of inbox materialization and tombstones.
      // A unique event/recipient/channel key survives retries and verification resends.
      await this.db.transaction(async (tx) => {
        const due = await tx
          .select({
            eventId: e.id,
            userId: u.id,
            email: u.email,
            payload: e.payload,
          })
          .from(e)
          .innerJoin(u, eq(u.id, e.aggregateId))
          .where(
            and(
              eq(e.eventType, 'user.registered'),
              isNotNull(e.payload),
              gt(
                e.occurredAt,
                sql`now() - ${NOTIFICATION_METADATA_RETENTION_MS} * interval '1 millisecond'`,
              ),
              eq(u.emailVerified, true),
              eq(u.isActive, true),
              or(
                eq(u.banned, false),
                isNull(u.banned),
                lte(u.banExpires, sql`now()`),
              ),
              notExists(
                tx
                  .select({ id: d.id })
                  .from(d)
                  .where(
                    and(
                      eq(d.eventId, e.id),
                      eq(d.recipientIdentity, sql`'user:' || ${u.id}`),
                      eq(d.channel, 'email'),
                    ),
                  ),
              ),
            ),
          )
          .orderBy(e.occurredAt, e.id)
          .limit(100)
          // Keep the account FK valid until delivery insertion completes.
          .for('key share', { of: u });
        if (due.length)
          await tx
            .insert(d)
            .values(
              due.map((row) => ({
                eventId: row.eventId,
                recipientIdentity: `user:${row.userId}`,
                recipientUserId: row.userId,
                recipientEmail: row.email,
                audiences: ['user'] as ['user'],
                payload: row.payload,
                providerIdempotencyKey: `welcome/${row.eventId}`,
              })),
            )
            .onConflictDoNothing();
      });
    } catch {
      this.logger.error(
        'User welcome reconciliation failed',
        undefined,
        UserNotificationReconciliationTask.name,
      );
    } finally {
      this.running = false;
    }
  }
}
