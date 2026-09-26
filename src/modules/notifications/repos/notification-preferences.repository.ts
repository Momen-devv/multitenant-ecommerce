import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { notificationPreferences as preferences } from '@/infrastructure/database/schema/notifications.schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  resolveNotificationEmail,
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
    updates.forEach((item) =>
      validatePreference(
        item.eventType,
        item.audience,
        storeId,
        item.emailEnabled,
      ),
    );
    await this.db.transaction(async (tx) => {
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
