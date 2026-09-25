import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import type { StorePaymentAccount } from '@/infrastructure/database/schema/schema.types';
import { storePaymentAccounts } from '@/infrastructure/database/schema/store-payments.schema';
import { generateUUIDv7 } from '@/common/utils/uuidv7';
import type { ConnectedAccount } from '@/infrastructure/payments/payment-gateway.interface';
import type { PaymentEnvironment } from '@/infrastructure/payments/payment-environment';

@Injectable()
export class StorePaymentAccountsRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async find(
    storeId: string,
    environment: PaymentEnvironment,
  ): Promise<StorePaymentAccount | undefined> {
    return this.db.query.storePaymentAccounts.findFirst({
      where: and(
        eq(storePaymentAccounts.storeId, storeId),
        eq(storePaymentAccounts.environment, environment),
      ),
    });
  }

  async ensureCreationIntent(input: {
    storeId: string;
    environment: PaymentEnvironment;
    frozenCreationRequest: Record<string, unknown>;
    creationProviderKey: string;
  }): Promise<StorePaymentAccount> {
    await this.db
      .insert(storePaymentAccounts)
      .values({
        id: generateUUIDv7(),
        storeId: input.storeId,
        environment: input.environment,
        frozenCreationRequest: input.frozenCreationRequest,
        creationProviderKey: input.creationProviderKey,
      })
      .onConflictDoNothing({
        target: [
          storePaymentAccounts.storeId,
          storePaymentAccounts.environment,
        ],
      });

    const row = await this.find(input.storeId, input.environment);
    if (!row) throw new Error('Store payment account intent was not persisted');
    return row;
  }

  async claimCreation(id: string, now = new Date()) {
    const leaseToken = generateUUIDv7();
    const [claimed] = await this.db
      .update(storePaymentAccounts)
      .set({
        creationStatus: 'creating',
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        nextRetryAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(storePaymentAccounts.id, id),
          isNull(storePaymentAccounts.accountId),
          or(
            eq(storePaymentAccounts.creationStatus, 'not_started'),
            and(
              eq(storePaymentAccounts.creationStatus, 'creating'),
              lte(storePaymentAccounts.leaseExpiresAt, now),
              lte(storePaymentAccounts.nextRetryAt, now),
            ),
          ),
        ),
      )
      .returning();

    return claimed ? { row: claimed, leaseToken } : undefined;
  }

  async markCreationDispatched(
    id: string,
    leaseToken: string,
    now = new Date(),
  ): Promise<StorePaymentAccount | undefined> {
    const [updated] = await this.db
      .update(storePaymentAccounts)
      .set({
        // Preserve the first dispatch timestamp for the provider
        // idempotency-retention safety check.
        creationDispatchedAt: sql`coalesce(${storePaymentAccounts.creationDispatchedAt}, ${now})`,
        updatedAt: now,
      })
      .where(
        and(
          eq(storePaymentAccounts.id, id),
          eq(storePaymentAccounts.creationStatus, 'creating'),
          eq(storePaymentAccounts.leaseToken, leaseToken),
        ),
      )
      .returning();
    return updated;
  }

  async findDueCreationRecoveries(
    environment: PaymentEnvironment,
    limit = 100,
    now = new Date(),
  ): Promise<StorePaymentAccount[]> {
    return this.db
      .select()
      .from(storePaymentAccounts)
      .where(
        and(
          isNull(storePaymentAccounts.accountId),
          eq(storePaymentAccounts.environment, environment),
          or(
            eq(storePaymentAccounts.creationStatus, 'not_started'),
            and(
              eq(storePaymentAccounts.creationStatus, 'creating'),
              lte(storePaymentAccounts.leaseExpiresAt, now),
              lte(storePaymentAccounts.nextRetryAt, now),
            ),
          ),
        ),
      )
      .orderBy(asc(storePaymentAccounts.nextRetryAt))
      .limit(limit);
  }

  async markCreationSucceeded(
    id: string,
    leaseToken: string,
    account: ConnectedAccount,
  ): Promise<StorePaymentAccount | undefined> {
    const [updated] = await this.db
      .update(storePaymentAccounts)
      .set({
        accountId: account.id,
        creationStatus: 'created',
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: null,
        ...this.readinessUpdate(account),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storePaymentAccounts.id, id),
          eq(storePaymentAccounts.creationStatus, 'creating'),
          eq(storePaymentAccounts.leaseToken, leaseToken),
          isNull(storePaymentAccounts.accountId),
        ),
      )
      .returning();
    return updated;
  }

  async markCreationFailure(
    id: string,
    leaseToken: string,
    error: string,
    retryCount: number,
  ): Promise<StorePaymentAccount | undefined> {
    const now = new Date();
    const retryAt = new Date(now.getTime() + this.retryDelay(retryCount));
    const terminalReview = retryCount + 1 >= 10;
    const [updated] = await this.db
      .update(storePaymentAccounts)
      .set({
        retryCount: sql`${storePaymentAccounts.retryCount} + 1`,
        nextRetryAt: retryAt,
        lastError: error.slice(0, 1000),
        leaseToken: terminalReview ? null : leaseToken,
        leaseExpiresAt: terminalReview ? null : retryAt,
        creationStatus: terminalReview ? 'review_required' : 'creating',
        updatedAt: now,
      })
      .where(
        and(
          eq(storePaymentAccounts.id, id),
          eq(storePaymentAccounts.creationStatus, 'creating'),
          eq(storePaymentAccounts.leaseToken, leaseToken),
        ),
      )
      .returning();
    return updated;
  }

  async updateReadiness(
    id: string,
    account: ConnectedAccount,
  ): Promise<StorePaymentAccount | undefined> {
    const [updated] = await this.db
      .update(storePaymentAccounts)
      .set({
        creationStatus: 'created',
        ...this.readinessUpdate(account),
        checkedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storePaymentAccounts.id, id),
          eq(storePaymentAccounts.accountId, account.id),
          isNull(storePaymentAccounts.deauthorizedAt),
        ),
      )
      .returning();
    return updated;
  }

  async markCreationReviewRequired(
    id: string,
    reason: string,
    leaseToken: string,
    expectedCreationDispatchedAt: Date | null,
  ): Promise<StorePaymentAccount[]> {
    return this.db
      .update(storePaymentAccounts)
      .set({
        creationStatus: 'review_required',
        chargesEnabled: false,
        payoutsEnabled: false,
        cardPaymentsActive: false,
        lastError: reason.slice(0, 1000),
        disabledReason:
          'Provider access could not be verified; operator review is required.',
        checkedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storePaymentAccounts.id, id),
          eq(storePaymentAccounts.creationStatus, 'creating'),
          isNull(storePaymentAccounts.accountId),
          eq(storePaymentAccounts.leaseToken, leaseToken),
          expectedCreationDispatchedAt === null
            ? isNull(storePaymentAccounts.creationDispatchedAt)
            : eq(
                storePaymentAccounts.creationDispatchedAt,
                expectedCreationDispatchedAt,
              ),
        ),
      )
      .returning();
  }

  async markReadinessReviewRequired(
    id: string,
    reason: string,
  ): Promise<StorePaymentAccount[]> {
    return this.db
      .update(storePaymentAccounts)
      .set({
        creationStatus: 'review_required',
        chargesEnabled: false,
        payoutsEnabled: false,
        cardPaymentsActive: false,
        lastError: reason.slice(0, 1000),
        disabledReason:
          'Provider access could not be verified; operator review is required.',
        checkedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storePaymentAccounts.id, id),
          isNull(storePaymentAccounts.deauthorizedAt),
          eq(storePaymentAccounts.creationStatus, 'created'),
        ),
      )
      .returning();
  }

  async recordReadinessSyncFailure(
    id: string,
    reason: string,
  ): Promise<StorePaymentAccount[]> {
    return this.db
      .update(storePaymentAccounts)
      .set({
        lastError: reason.slice(0, 1000),
        updatedAt: new Date(),
      })
      .where(eq(storePaymentAccounts.id, id))
      .returning();
  }

  async markDeauthorized(id: string): Promise<StorePaymentAccount[]> {
    return this.db
      .update(storePaymentAccounts)
      .set({
        deauthorizedAt: new Date(),
        chargesEnabled: false,
        payoutsEnabled: false,
        cardPaymentsActive: false,
        disabledReason: 'The Store payment account was deauthorized in Stripe.',
        updatedAt: new Date(),
      })
      .where(eq(storePaymentAccounts.id, id))
      .returning();
  }

  private readinessUpdate(account: ConnectedAccount) {
    return {
      chargesEnabled: account.chargesEnabled,
      payoutsEnabled: account.payoutsEnabled,
      cardPaymentsActive: account.cardPaymentsActive,
      detailsSubmitted: account.detailsSubmitted,
      requirementsDue: account.requirementsDue,
      disabledReason: account.disabledReason,
      checkedAt: new Date(),
    };
  }

  private retryDelay(retryCount: number): number {
    const delays = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
    return delays[Math.min(retryCount, delays.length - 1)];
  }
}
