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
      let fairIds: string[] | null = null;
      if (eventType === OutboxEventType.NOTIFICATION_INTENT) {
        const ranked = tx
          .select({
            id: outboxEvents.id,
            createdAt: outboxEvents.createdAt,
            round:
              sql<number>`row_number() over (partition by ${outboxEvents.payload}->>'storeId' order by ${outboxEvents.createdAt}, ${outboxEvents.id})`.as(
                'round',
              ),
          })
          .from(outboxEvents)
          .where(
            and(
              eq(outboxEvents.eventType, eventType),
              isNull(outboxEvents.publishedAt),
              isNull(outboxEvents.deadLetteredAt),
              lte(outboxEvents.availableAt, now),
            ),
          )
          .as('due');
        fairIds = (
          await tx
            .select({ id: ranked.id })
            .from(ranked)
            .orderBy(ranked.round, ranked.createdAt, ranked.id)
            .limit(limit)
        ).map((row) => row.id);
      }
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
