import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';
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
      const accounts = await this.db.execute<{ id: string }>(sql`
        select u.id from "user" u, notification_registration_rollout r
        where r.id = 'welcome-v1' and u.created_at >= r.activated_at
          and not exists (select 1 from notification_milestones m
            where m.source_key = 'user:' || u.id || ':registered')
        order by u.created_at, u.id limit 100`);
      for (const account of accounts.rows)
        await captureRegisteredUser(this.db, account.id);
      // Email eligibility is independent of inbox materialization and tombstones.
      // A unique event/recipient/channel key survives retries and verification resends.
      await this.db.execute(sql`
        insert into notification_email_deliveries
          (id, event_id, recipient_identity, recipient_user_id, recipient_email,
           audiences, payload, provider_idempotency_key)
        select gen_random_uuid(), e.id, 'user:' || u.id, u.id, u.email,
          '["user"]'::jsonb, e.payload, 'welcome/' || e.id::text
        from notification_events e join "user" u on u.id = e.aggregate_id
        where e.event_type = 'user.registered' and e.payload is not null
          and e.occurred_at > now() - interval '180 days'
          and u.email_verified and u.is_active
          and (u.banned is not true or u.ban_expires <= now())
          and not exists (select 1 from notification_email_deliveries d
            where d.event_id = e.id and d.recipient_identity = 'user:' || u.id and d.channel = 'email')
        order by e.occurred_at, e.id limit 100 on conflict do nothing`);
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
