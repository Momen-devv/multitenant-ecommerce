import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { OutboxEventType } from '@/common/enums/outbox-event-type.enum';
import { outboxEvents } from '@/infrastructure/database/schema/outbox.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type ClaimedOutboxEvent = {
  id: string;
  aggregateId: string;
  payload: unknown;
  attempts: number;
};

@Injectable()
export class OutboxRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async claimDue(
    eventType: OutboxEventType,
    limit: number,
    leaseDurationMs: number,
  ): Promise<ClaimedOutboxEvent[]> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      // Notification fan-out has a Store budget independent of BullMQ.
      const fairIds =
        eventType === OutboxEventType.NOTIFICATION_INTENT
          ? (
              await tx.execute<{ id: string }>(sql`select id from (
            select id, created_at, row_number() over (
              partition by payload->>'storeId' order by created_at, id
            ) as round from outbox_events
            where event_type = ${eventType} and published_at is null
              and dead_lettered_at is null and available_at <= ${now}
          ) due order by round, created_at, id limit ${limit}`)
            ).rows.map((row) => row.id)
          : null;
      if (fairIds?.length === 0) return [];
      const dueEvents = await tx
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.eventType, eventType),
            isNull(outboxEvents.publishedAt),
            isNull(outboxEvents.deadLetteredAt),
            lte(outboxEvents.availableAt, now),
            fairIds ? inArray(outboxEvents.id, fairIds) : undefined,
          ),
        )
        .orderBy(asc(outboxEvents.createdAt))
        .limit(limit)
        .for('update', { skipLocked: true });

      if (dueEvents.length === 0) return [];

      return tx
        .update(outboxEvents)
        .set({ availableAt: new Date(now.getTime() + leaseDurationMs) })
        .where(
          and(
            inArray(
              outboxEvents.id,
              dueEvents.map(({ id }) => id),
            ),
            isNull(outboxEvents.publishedAt),
            isNull(outboxEvents.deadLetteredAt),
          ),
        )
        .returning({
          id: outboxEvents.id,
          aggregateId: outboxEvents.aggregateId,
          payload: outboxEvents.payload,
          attempts: outboxEvents.attempts,
        });
    });
  }

  async markPublished(eventId: string): Promise<void> {
    await this.db
      .update(outboxEvents)
      .set({ publishedAt: new Date(), lastError: null })
      .where(
        and(
          eq(outboxEvents.id, eventId),
          isNull(outboxEvents.publishedAt),
          isNull(outboxEvents.deadLetteredAt),
        ),
      );
  }

  async rescheduleAfterFailure(
    eventId: string,
    error: string,
    retryDelayMs: number,
    maxAttempts: number,
    onDeadLetter?: (tx: NodePgDatabase<typeof schema>) => Promise<void>,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(outboxEvents)
        .set({
          attempts: sql`${outboxEvents.attempts} + 1`,
          availableAt: new Date(Date.now() + retryDelayMs),
          lastError: error.slice(0, 1000),
          deadLetteredAt: sql`CASE WHEN ${outboxEvents.attempts} + 1 >= ${maxAttempts} THEN NOW() ELSE NULL END`,
        })
        .where(
          and(
            eq(outboxEvents.id, eventId),
            isNull(outboxEvents.publishedAt),
            isNull(outboxEvents.deadLetteredAt),
          ),
        )
        .returning({ deadLetteredAt: outboxEvents.deadLetteredAt });

      const terminal = Boolean(updated?.deadLetteredAt);
      if (terminal && onDeadLetter) await onDeadLetter(tx);
      return terminal;
    });
  }
}
