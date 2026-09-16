import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import { connectWebhookEvents } from '@/infrastructure/database/schema/store-payments.schema';
import { generateUUIDv7 } from '@/common/utils/uuidv7';
import type { PaymentEnvironment } from '../payment-environment';

export const CONNECT_EVENT_LEASE_MS = 5 * 60 * 1000;
export const CONNECT_EVENT_MAX_ATTEMPTS = 10;

@Injectable()
export class PaymentEventsRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async store(input: {
    environment: PaymentEnvironment;
    accountId: string;
    stripeEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    receivedAt?: Date;
  }) {
    const [inserted] = await this.db
      .insert(connectWebhookEvents)
      .values({
        id: generateUUIDv7(),
        ...input,
      })
      .onConflictDoNothing({
        target: [
          connectWebhookEvents.environment,
          connectWebhookEvents.stripeEventId,
        ],
      })
      .returning({
        id: connectWebhookEvents.id,
        status: connectWebhookEvents.status,
      });

    if (inserted) return inserted;
    const existing = await this.db.query.connectWebhookEvents.findFirst({
      where: and(
        eq(connectWebhookEvents.environment, input.environment),
        eq(connectWebhookEvents.stripeEventId, input.stripeEventId),
      ),
      columns: { id: true, status: true },
    });
    if (!existing) throw new Error('Connect webhook receipt disappeared');
    return existing;
  }

  async claim(eventId: string, allowedEventTypes: string[], now = new Date()) {
    const staleOrDue = or(
      and(
        eq(connectWebhookEvents.status, 'failed'),
        lte(connectWebhookEvents.nextRetryAt, now),
      ),
      and(
        eq(connectWebhookEvents.status, 'processing'),
        lte(connectWebhookEvents.leaseExpiresAt, now),
      ),
    );

    await this.db
      .update(connectWebhookEvents)
      .set({
        status: 'dead_letter',
        leaseToken: null,
        leaseExpiresAt: null,
        lastError:
          'Connect webhook processing lease expired after maximum attempts',
        updatedAt: now,
      })
      .where(
        and(
          eq(connectWebhookEvents.id, eventId),
          inArray(connectWebhookEvents.eventType, allowedEventTypes),
          staleOrDue,
          sql`${connectWebhookEvents.attempts} >= ${CONNECT_EVENT_MAX_ATTEMPTS}`,
        ),
      );

    const [claimed] = await this.db
      .update(connectWebhookEvents)
      .set({
        status: 'processing',
        attempts: sql`${connectWebhookEvents.attempts} + 1`,
        leaseToken: generateUUIDv7(),
        leaseExpiresAt: new Date(now.getTime() + CONNECT_EVENT_LEASE_MS),
        lastError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(connectWebhookEvents.id, eventId),
          inArray(connectWebhookEvents.eventType, allowedEventTypes),
          or(eq(connectWebhookEvents.status, 'pending'), staleOrDue),
          sql`${connectWebhookEvents.attempts} < ${CONNECT_EVENT_MAX_ATTEMPTS}`,
        ),
      )
      .returning();
    return claimed;
  }

  async dueIds(allowedEventTypes: string[], limit = 100, now = new Date()) {
    const rows = await this.db
      .select({ id: connectWebhookEvents.id })
      .from(connectWebhookEvents)
      .where(
        and(
          or(
            eq(connectWebhookEvents.status, 'pending'),
            and(
              eq(connectWebhookEvents.status, 'failed'),
              lte(connectWebhookEvents.nextRetryAt, now),
            ),
            and(
              eq(connectWebhookEvents.status, 'processing'),
              lte(connectWebhookEvents.leaseExpiresAt, now),
            ),
          ),
          inArray(connectWebhookEvents.eventType, allowedEventTypes),
        ),
      )
      .orderBy(asc(connectWebhookEvents.nextRetryAt))
      .limit(limit);
    return rows.map((row) => row.id);
  }

  async completeUnclaimed(eventId: string) {
    await this.db
      .update(connectWebhookEvents)
      .set({
        status: 'completed',
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(connectWebhookEvents.id, eventId),
          eq(connectWebhookEvents.status, 'pending'),
        ),
      );
  }

  async complete(eventId: string, leaseToken: string) {
    const [updated] = await this.db
      .update(connectWebhookEvents)
      .set({
        status: 'completed',
        processedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(connectWebhookEvents.id, eventId),
          eq(connectWebhookEvents.status, 'processing'),
          eq(connectWebhookEvents.leaseToken, leaseToken),
        ),
      )
      .returning({ id: connectWebhookEvents.id });
    return Boolean(updated);
  }

  async fail(
    eventId: string,
    leaseToken: string,
    error: string,
    retryAt: Date,
  ) {
    const [current] = await this.db
      .select({ attempts: connectWebhookEvents.attempts })
      .from(connectWebhookEvents)
      .where(
        and(
          eq(connectWebhookEvents.id, eventId),
          eq(connectWebhookEvents.status, 'processing'),
          eq(connectWebhookEvents.leaseToken, leaseToken),
        ),
      )
      .limit(1);
    if (!current) return;

    await this.db
      .update(connectWebhookEvents)
      .set({
        status:
          current.attempts >= CONNECT_EVENT_MAX_ATTEMPTS
            ? 'dead_letter'
            : 'failed',
        lastError: error.slice(0, 1000),
        nextRetryAt: retryAt,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(connectWebhookEvents.id, eventId),
          eq(connectWebhookEvents.leaseToken, leaseToken),
        ),
      );
  }
}
