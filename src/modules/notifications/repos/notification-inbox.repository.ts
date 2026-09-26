import { NotificationStreamService } from '../services/notification-stream.service';
import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull, isNotNull, sql, type SQL } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import {
  notifications as n,
  notificationRecipientStates as states,
} from '@/infrastructure/database/schema/notifications.schema';
import { orderReadRoles } from '../domain/order-read-roles';
import { NotificationListDto } from '../dto/notifications.dto';

// Evaluate current access in the same database snapshot as each read/mutation.
export function visibleNotification(userId: string) {
  return and(
    eq(n.recipientUserId, userId),
    isNull(n.deletedAt),
    sql`${n.occurredAt} > statement_timestamp() - interval '90 days'`,
    sql`exists (select 1 from "user" u where u.id = ${userId} and u.is_active = true and (u.banned is not true or u.ban_expires <= statement_timestamp()))`,
    sql`(
      ${n.audiences} ? 'user'
      or (${n.audiences} ? 'customer' and exists (select 1 from orders o where o.id::text = ${n.resource}->>'id' and o.store_id = ${n.storeId} and o.user_id = ${userId}))
      or (${n.audiences} ? 'staff' and exists (select 1 from store s join member m on m.organization_id = s.organization_id where s.id = ${n.storeId} and m.user_id = ${userId} and string_to_array(m.role, ',') && ${sql.param(orderReadRoles)}::text[]))
      or (${n.audiences} ? 'storeOwner' and exists (select 1 from store s where s.id = ${n.storeId} and s.owner_id = ${userId}))
      or ${n.audiences} ? 'inviter'
      or (${n.audiences} ? 'invitee' and exists (select 1 from "user" u join invitation_notification_state st on st.bound_user_id = u.id where u.id = ${userId} and u.email_verified = true and st.invitation_id = ${n.resource}->>'id' and lower(trim(u.email)) = st.normalized_email))
      or (${n.audiences} ? 'admin' and exists (select 1 from "user" u where u.id = ${userId} and 'platformSuperAdmin' = any(string_to_array(u.role, ','))))
    )`,
  );
}

@Injectable()
export class NotificationInboxRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly stream: NotificationStreamService,
  ) {}

  async list(userId: string, query: NotificationListDto) {
    const scope = JSON.stringify([
      userId,
      query.storeId ?? null,
      query.type ?? null,
      query.unread ?? null,
      query.archived === 'true',
    ]);
    let after: SQL | undefined;
    if (query.cursor) {
      try {
        if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error();
        const decoded: unknown = JSON.parse(
          Buffer.from(query.cursor, 'base64url').toString(),
        );
        if (!Array.isArray(decoded) || decoded.length !== 3) throw new Error();
        const [time, id, cursorScope] = decoded as unknown[];
        if (
          typeof time !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(time) ||
          !Number.isFinite(Date.parse(time)) ||
          time.startsWith('0000') ||
          new Date(time).toISOString().slice(0, 23) !== time.slice(0, 23) ||
          typeof id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
          ) ||
          cursorScope !== scope
        )
          throw new Error();
        after = sql`(${n.occurredAt}, ${n.id}) < (${time}::timestamptz, ${id}::uuid)`;
      } catch {
        throw new BadRequestException('Invalid cursor or filter scope');
      }
    }
    const rows = await this.db
      .select({
        id: n.id,
        storeId: n.storeId,
        type: n.type,
        display: n.display,
        resource: n.resource,
        occurredAt: n.occurredAt,
        readAt: n.readAt,
        archivedAt: n.archivedAt,
        cursorTime: sql<string>`to_char(${n.occurredAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        invitationStatus: sql<
          string | null
        >`case when ${n.resource}->>'kind' = 'invitation' then (select case when i.status = 'pending' and i.expires_at <= statement_timestamp() then 'expired' else i.status end from invitation i where i.id = ${n.resource}->>'id') else null end`,
      })
      .from(n)
      .where(
        and(
          visibleNotification(userId),
          query.storeId ? eq(n.storeId, query.storeId) : undefined,
          query.type ? eq(n.type, query.type) : undefined,
          query.unread === undefined
            ? undefined
            : query.unread === 'true'
              ? isNull(n.readAt)
              : isNotNull(n.readAt),
          query.archived === 'true'
            ? isNotNull(n.archivedAt)
            : isNull(n.archivedAt),
          after,
        ),
      )
      .orderBy(desc(n.occurredAt), desc(n.id))
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        storeId: row.storeId,
        type: row.type,
        display: row.display,
        resource: row.resource,
        occurredAt: row.occurredAt,
        readAt: row.readAt,
        archivedAt: row.archivedAt,
        invitationStatus: row.invitationStatus,
      })),
      nextCursor:
        rows.length > query.limit && last
          ? Buffer.from(
              JSON.stringify([last.cursorTime, last.id, scope]),
            ).toString('base64url')
          : null,
    };
  }

  async count(userId: string, storeId?: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(n)
      .where(
        and(
          visibleNotification(userId),
          isNull(n.readAt),
          isNull(n.archivedAt),
          storeId ? eq(n.storeId, storeId) : undefined,
        ),
      );
    return row;
  }

  async get(userId: string, id: string) {
    const [row] = await this.db
      .select({
        id: n.id,
        storeId: n.storeId,
        type: n.type,
        display: n.display,
        resource: n.resource,
        occurredAt: n.occurredAt,
        readAt: n.readAt,
        archivedAt: n.archivedAt,
        invitationStatus: sql<
          string | null
        >`case when ${n.resource}->>'kind' = 'invitation' then (select case when i.status = 'pending' and i.expires_at <= statement_timestamp() then 'expired' else i.status end from invitation i where i.id = ${n.resource}->>'id') else null end`,
      })
      .from(n)
      .where(and(visibleNotification(userId), eq(n.id, id)));
    if (!row) throw new NotFoundException('Notification not found');
    return row;
  }

  async readAll(userId: string, storeId?: string) {
    // One UPDATE: concurrent inserts after this statement's MVCC snapshot stay unread.
    const update = this.db
      .update(n)
      .set({ readAt: sql`statement_timestamp()` })
      .where(
        and(
          visibleNotification(userId),
          isNull(n.readAt),
          isNull(n.archivedAt),
          storeId ? eq(n.storeId, storeId) : undefined,
        ),
      )
      .returning({ id: n.id });
    const result = await this.db.execute<{ count: number }>(
      sql`with changed as (${update}) select count(*)::int as count from changed`,
    );
    if (result.rows[0]?.count) await this.stream.publish(userId);
    return result.rows[0];
  }

  async mutate(
    userId: string,
    id: string,
    action: 'read' | 'archive' | 'delete',
    archived = false,
  ) {
    const result = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(n)
        .set(
          action === 'read'
            ? { readAt: sql`coalesce(${n.readAt}, statement_timestamp())` }
            : action === 'archive'
              ? {
                  archivedAt: archived
                    ? sql`coalesce(${n.archivedAt}, statement_timestamp())`
                    : null,
                }
              : { deletedAt: sql`statement_timestamp()` },
        )
        .where(and(visibleNotification(userId), eq(n.id, id)))
        .returning({ id: n.id, eventId: n.eventId });
      if (!row) throw new NotFoundException('Notification not found');
      if (action === 'delete')
        await tx
          .update(states)
          .set({ outcome: 'deleted', updatedAt: new Date() })
          .where(
            and(eq(states.eventId, row.eventId), eq(states.userId, userId)),
          );
      return { id: row.id };
    });
    await this.stream.publish(userId);
    return result;
  }
}
