import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { notificationPreferences as preferences } from '@/infrastructure/database/schema/notifications.schema';
import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  resolveNotificationEmail,
  notificationCatalog,
  notificationPolicy,
  validatePreference,
  type NotificationAudience,
  type NotificationEventType,
} from '../domain/notification-policy';
import type { NotificationRecipient } from '../domain/notification-recipient';
import type { NotificationPreference } from '@/infrastructure/database/schema/schema.types';

export type NotificationPreferenceUpdate = Pick<
  NotificationPreference,
  'eventType' | 'audience'
> & {
  emailEnabled: boolean | null;
};

@Injectable()
export class NotificationPreferencesRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private async authorizeScope(
    db: Pick<NodePgDatabase<typeof schema>, 'execute'>,
    userId: string,
    storeId: string | null,
  ) {
    if (!storeId) return;
    const result =
      await db.execute(sql`select 1 from store s where s.id = ${storeId} and (
      exists (select 1 from member m where m.organization_id = s.organization_id and m.user_id = ${userId})
      or exists (select 1 from orders o where o.store_id = s.id and o.user_id = ${userId})
      or exists (select 1 from invitation i join "user" u on u.id = ${userId} where i.organization_id = s.organization_id and (i.inviter_id = u.id or (u.email_verified = true and lower(i.email) = lower(u.email))))
      or exists (select 1 from invitation_notification_state i join "user" u on u.id = ${userId} where i.store_id = s.id and (i.inviter_user_id = u.id or (u.email_verified = true and i.bound_user_id = u.id and i.normalized_email = lower(u.email))))
    )`);
    if (!result.rows.length) throw new NotFoundException('Store not found');
  }

  async get(userId: string, storeId: string | null) {
    return this.db.transaction(async (tx) => {
      await this.authorizeScope(tx, userId, storeId);
      const rows = await tx
        .select()
        .from(preferences)
        .where(eq(preferences.userId, userId));
      return Object.entries(notificationCatalog).flatMap(([event, audiences]) =>
        Object.keys(audiences).flatMap((reason) => {
          const eventType = event as NotificationEventType;
          const audience = reason as NotificationAudience;
          const policy = notificationPolicy(eventType, audience);
          if (storeId && !policy.storeScoped) return [];
          const globalOverride =
            rows.find(
              (row) =>
                row.storeId === null &&
                row.eventType === eventType &&
                row.audience === audience,
            )?.emailEnabled ?? null;
          const storeOverride = storeId
            ? (rows.find(
                (row) =>
                  row.storeId === storeId &&
                  row.eventType === eventType &&
                  row.audience === audience,
              )?.emailEnabled ?? null)
            : null;
          return [
            {
              eventType,
              audience,
              mandatory: policy.mandatory,
              storeScoped: policy.storeScoped,
              defaultEmailEnabled: policy.emailEnabled,
              globalOverride,
              storeOverride,
              emailEnabled: resolveNotificationEmail(eventType, audience, {
                global: globalOverride,
                store: storeOverride,
              }),
            },
          ];
        }),
      );
    });
  }

  /** One snapshot resolves every audience reason; mandatory policy wins overlaps. */
  async recipientEmailEnabled(
    recipient: NotificationRecipient,
    storeId: string | null,
    eventType: NotificationEventType,
  ) {
    const rows = recipient.userId
      ? await this.db
          .select()
          .from(preferences)
          .where(
            and(
              eq(preferences.userId, recipient.userId),
              eq(preferences.eventType, eventType),
            ),
          )
      : [];
    return recipient.audiences.some((audience) =>
      resolveNotificationEmail(eventType, audience, {
        global: rows.find(
          (row) => row.storeId === null && row.audience === audience,
        )?.emailEnabled,
        store: storeId
          ? rows.find(
              (row) => row.storeId === storeId && row.audience === audience,
            )?.emailEnabled
          : undefined,
      }),
    );
  }

  /** Caller must authorize Store scope before calling this persistence seam. */
  async update(
    userId: string,
    storeId: string | null,
    updates: NotificationPreferenceUpdate[],
  ) {
    const keys = new Set<string>();
    try {
      updates.forEach((item) => {
        validatePreference(
          item.eventType,
          item.audience,
          storeId,
          item.emailEnabled,
        );
        const key = `${item.eventType}:${item.audience}`;
        if (keys.has(key)) throw new Error('Duplicate preference key');
        keys.add(key);
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid preferences',
      );
    }
    await this.db.transaction(async (tx) => {
      await this.authorizeScope(tx, userId, storeId);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${userId} || ':notification-preferences'))`,
      );
      for (const item of updates) {
        const where = and(
          eq(preferences.userId, userId),
          eq(preferences.eventType, item.eventType),
          eq(preferences.audience, item.audience),
          storeId
            ? eq(preferences.storeId, storeId)
            : isNull(preferences.storeId),
        );
        await tx.delete(preferences).where(where);
        if (item.emailEnabled !== null)
          await tx.insert(preferences).values({
            userId,
            storeId,
            ...item,
            emailEnabled: item.emailEnabled,
          });
      }
    });
  }

  async emailEnabled(
    userId: string | null,
    storeId: string | null,
    eventType: NotificationEventType,
    audience: NotificationAudience,
  ) {
    if (!userId) return resolveNotificationEmail(eventType, audience);
    const rows = await this.db
      .select()
      .from(preferences)
      .where(
        and(
          eq(preferences.userId, userId),
          eq(preferences.eventType, eventType),
          eq(preferences.audience, audience),
        ),
      );
    return resolveNotificationEmail(eventType, audience, {
      global: rows.find((row) => row.storeId === null)?.emailEnabled,
      store: storeId
        ? rows.find((row) => row.storeId === storeId)?.emailEnabled
        : undefined,
    });
  }
}
