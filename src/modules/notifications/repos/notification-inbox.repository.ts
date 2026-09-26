import { NotificationStreamService } from '../services/notification-stream.service';
import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  exists,
  gt,
  isNull,
  isNotNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
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
export function visibleNotification(
  db: Pick<NodePgDatabase<typeof schema>, 'select'>,
  userId: string,
) {
  const {
    user: u,
    orders: o,
    store: s,
    member: m,
    invitationNotificationState: st,
  } = schema;
  const currentTime = sql<Date>`statement_timestamp()`;
  const audience = (value: string) => sql`${n.audiences} ? ${value}`;
  const resourceId = sql<string>`${n.resource}->>'id'`;
  const activeUser = db
    .select({ id: u.id })
    .from(u)
    .where(
      and(
        eq(u.id, userId),
        eq(u.isActive, true),
        or(
          isNull(u.banned),
          ne(u.banned, true),
          lte(u.banExpires, currentTime),
        ),
      ),
    );
  const purchase = db
    .select({ id: o.id })
    .from(o)
    .where(
      and(
        eq(sql<string>`${o.id}::text`, resourceId),
        eq(o.storeId, n.storeId),
        eq(o.userId, userId),
      ),
    );
  const staff = db
    .select({ id: s.id })
    .from(s)
    .innerJoin(m, eq(m.organizationId, s.organizationId))
    .where(
      and(
        eq(s.id, n.storeId),
        eq(m.userId, userId),
        sql`string_to_array(${m.role}, ',') && ${sql.param(orderReadRoles)}::text[]`,
      ),
    );
  const owner = db
    .select({ id: s.id })
    .from(s)
    .where(and(eq(s.id, n.storeId), eq(s.ownerId, userId)));
  const invitee = db
    .select({ id: u.id })
    .from(u)
    .innerJoin(st, eq(st.boundUserId, u.id))
    .where(
      and(
        eq(u.id, userId),
        eq(u.emailVerified, true),
        eq(st.invitationId, resourceId),
        eq(sql<string>`lower(trim(${u.email}))`, st.normalizedEmail),
      ),
    );
  const admin = db
    .select({ id: u.id })
    .from(u)
    .where(
      and(
        eq(u.id, userId),
        sql`'platformSuperAdmin' = any(string_to_array(${u.role}, ','))`,
      ),
    );
  return and(
    eq(n.recipientUserId, userId),
    isNull(n.deletedAt),
    gt(n.occurredAt, sql<Date>`statement_timestamp() - interval '90 days'`),
    exists(activeUser),
    or(
      audience('user'),
      and(audience('customer'), exists(purchase)),
      and(audience('staff'), exists(staff)),
      and(audience('storeOwner'), exists(owner)),
      audience('inviter'),
      and(audience('invitee'), exists(invitee)),
      and(audience('admin'), exists(admin)),
    ),
  );
}

function invitationProjection() {
  const i = schema.invitation;
  return {
    invitationStatus: i.status,
    invitationExpired: lte(
      i.expiresAt,
      sql<Date>`statement_timestamp()`,
    ).mapWith(Boolean),
  };
}

function invitationJoin() {
  return and(
    eq(sql<string>`${n.resource}->>'kind'`, 'invitation'),
    eq(schema.invitation.id, sql<string>`${n.resource}->>'id'`),
  );
}

function currentInvitationStatus(
  status: string | null,
  expired: boolean | null,
) {
  return status === 'pending' && expired ? 'expired' : status;
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
        const cursorTime = sql<Date>`${time}::timestamptz`;
        after = or(
          lt(n.occurredAt, cursorTime),
          and(eq(n.occurredAt, cursorTime), lt(n.id, id)),
        );
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
        ...invitationProjection(),
      })
      .from(n)
      .leftJoin(schema.invitation, invitationJoin())
      .where(
        and(
          visibleNotification(this.db, userId),
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
        invitationStatus: currentInvitationStatus(
          row.invitationStatus,
          row.invitationExpired,
        ),
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
      .select({ count: count() })
      .from(n)
      .where(
        and(
          visibleNotification(this.db, userId),
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
        ...invitationProjection(),
      })
      .from(n)
      .leftJoin(schema.invitation, invitationJoin())
      .where(and(visibleNotification(this.db, userId), eq(n.id, id)));
    if (!row) throw new NotFoundException('Notification not found');
    const { invitationExpired, ...notification } = row;
    return {
      ...notification,
      invitationStatus: currentInvitationStatus(
        row.invitationStatus,
        invitationExpired,
      ),
    };
  }

  async readAll(userId: string, storeId?: string) {
    // One UPDATE: concurrent inserts after this statement's MVCC snapshot stay unread.
    const result = await this.db
      .update(n)
      .set({ readAt: sql`statement_timestamp()` })
      .where(
        and(
          visibleNotification(this.db, userId),
          isNull(n.readAt),
          isNull(n.archivedAt),
          storeId ? eq(n.storeId, storeId) : undefined,
        ),
      );
    const affected = result.rowCount ?? 0;
    if (affected) await this.stream.publish(userId);
    return { count: affected };
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
        .where(and(visibleNotification(tx, userId), eq(n.id, id)))
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
