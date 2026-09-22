import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { generateUUIDv7 } from '@/common/utils';
import { orderEmailDeliveries } from '@/infrastructure/database/schema/orders.schema';
import type { OrderEmailIntent } from '@/modules/orders/domain/order-email-intent';
import * as schema from '@/infrastructure/database/schema/schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, lte, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

type Database = NodePgDatabase<typeof schema>;

@Injectable()
export class OrderEmailDeliveryRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async ensurePending(input: {
    outboxEventId: string;
    intent: OrderEmailIntent;
  }) {
    await this.db
      .insert(orderEmailDeliveries)
      .values({
        outboxEventId: input.outboxEventId,
        orderId: input.intent.orderId,
        transitionVersion: input.intent.version,
        type: input.intent.type,
        recipientEmail: input.intent.to,
        payload: input.intent,
        providerIdempotencyKey: `order-email:${input.intent.orderId}:${input.intent.version}:${input.intent.type}`,
      })
      .onConflictDoNothing();

    const [delivery] = await this.db
      .select()
      .from(orderEmailDeliveries)
      .where(eq(orderEmailDeliveries.outboxEventId, input.outboxEventId));
    if (!delivery) throw new Error('Order email delivery was not persisted.');
    return delivery;
  }

  async markEnqueued(deliveryId: string): Promise<void> {
    await this.db
      .update(orderEmailDeliveries)
      .set({ lastQueuedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(orderEmailDeliveries.id, deliveryId),
          isNull(orderEmailDeliveries.sentAt),
        ),
      );
  }

  async findDueForEnqueue(limit: number): Promise<string[]> {
    const now = new Date();
    const staleQueueAt = new Date(now.getTime() - 5 * 60_000);
    const rows = await this.db
      .select({ id: orderEmailDeliveries.id })
      .from(orderEmailDeliveries)
      .where(
        and(
          isNull(orderEmailDeliveries.sentAt),
          isNull(orderEmailDeliveries.deadLetteredAt),
          lte(orderEmailDeliveries.nextAttemptAt, now),
          or(
            isNull(orderEmailDeliveries.lastQueuedAt),
            lte(orderEmailDeliveries.lastQueuedAt, staleQueueAt),
          ),
        ),
      )
      .limit(limit);
    return rows.map((row) => row.id);
  }

  async claimForSend(deliveryId: string) {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [delivery] = await tx
        .select()
        .from(orderEmailDeliveries)
        .where(
          and(
            eq(orderEmailDeliveries.id, deliveryId),
            isNull(orderEmailDeliveries.sentAt),
            isNull(orderEmailDeliveries.deadLetteredAt),
            lte(orderEmailDeliveries.nextAttemptAt, now),
            or(
              isNull(orderEmailDeliveries.leaseExpiresAt),
              lte(orderEmailDeliveries.leaseExpiresAt, now),
            ),
          ),
        )
        .for('update');
      if (!delivery) return null;

      const leaseToken = generateUUIDv7();
      const [claimed] = await tx
        .update(orderEmailDeliveries)
        .set({
          status: 'sending',
          leaseToken,
          leaseExpiresAt: new Date(now.getTime() + 5 * 60_000),
          updatedAt: now,
        })
        .where(eq(orderEmailDeliveries.id, delivery.id))
        .returning();
      if (!claimed) return null;
      return { delivery: claimed, leaseToken };
    });
  }

  async markSent(
    deliveryId: string,
    leaseToken: string,
    providerMessageId: string | undefined,
  ): Promise<void> {
    await this.db
      .update(orderEmailDeliveries)
      .set({
        status: 'sent',
        sentAt: new Date(),
        providerMessageId: providerMessageId ?? null,
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orderEmailDeliveries.id, deliveryId),
          eq(orderEmailDeliveries.leaseToken, leaseToken),
        ),
      );
  }

  async rescheduleAfterFailure(
    deliveryId: string,
    leaseToken: string,
    error: string,
  ): Promise<void> {
    const [current] = await this.db
      .select({ attempts: orderEmailDeliveries.attempts })
      .from(orderEmailDeliveries)
      .where(
        and(
          eq(orderEmailDeliveries.id, deliveryId),
          eq(orderEmailDeliveries.leaseToken, leaseToken),
        ),
      );
    if (!current) return;

    const attempts = current.attempts + 1;
    const deadLettered = attempts >= 10;
    const retryDelayMs = Math.min(
      60 * 60_000,
      60_000 * 5 ** Math.min(attempts - 1, 3),
    );
    await this.db
      .update(orderEmailDeliveries)
      .set({
        status: deadLettered ? 'dead_lettered' : 'pending',
        attempts,
        nextAttemptAt: new Date(Date.now() + retryDelayMs),
        deadLetteredAt: deadLettered ? new Date() : null,
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: error.slice(0, 1000),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orderEmailDeliveries.id, deliveryId),
          eq(orderEmailDeliveries.leaseToken, leaseToken),
        ),
      );
  }
}
