import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { stripeConfig } from '@/core/config';
import * as schema from '@/infrastructure/database/schema/schema';
import type { StorePaymentAccount } from '@/infrastructure/database/schema/schema.types';
import { store, user } from '@/infrastructure/database/schema/schema';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CodedHttpError } from '@/common/errors';
import type { ActiveStoreContext } from '@/common/guards/active-store.guard';
import { StorePaymentAccountsRepository } from '../repos/store-payment-accounts.repository';
import type { PaymentEnvironment } from '@/infrastructure/payments/payment-environment';
import { PAYMENT_GATEWAY } from '@/infrastructure/payments/payment.tokens';
import type {
  CreateConnectedAccountInput,
  PaymentGateway,
} from '@/infrastructure/payments/payment-gateway.interface';
import {
  StorePaymentConnectionStatus,
  type StorePaymentConnectionResponseDto,
} from '../dto/store-payment-connection.dto';

// Stripe retains idempotency results for at least 24 hours. Stop automatic
// retries one hour early so an uncertain request cannot create a second
// account after the provider may have discarded the original key.
export const CREATION_IDEMPOTENCY_SAFETY_WINDOW_MS = 23 * 60 * 60 * 1000;

@Injectable()
export class StorePaymentsService {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly accounts: StorePaymentAccountsRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(stripeConfig.KEY)
    private readonly config: ConfigType<typeof stripeConfig>,
  ) {}

  async getConnection(storeContext: ActiveStoreContext) {
    const row = await this.accounts.find(
      storeContext.storeId,
      this.environment,
    );
    return this.toConnection(row);
  }

  async createOnboarding(
    storeContext: ActiveStoreContext,
    idempotencyKey: string | undefined,
  ) {
    this.requireIdempotencyKey(idempotencyKey);
    const storeOwner = await this.findStoreOwner(storeContext.storeId);
    if (!storeOwner) {
      throw new CodedHttpError(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Store not found for the active organization.',
      );
    }

    const providerKey = `connect-${this.environment}-store-${storeContext.storeId}-account-v1`;
    let row = await this.accounts.ensureCreationIntent({
      storeId: storeContext.storeId,
      environment: this.environment,
      creationProviderKey: providerKey,
      frozenCreationRequest: {
        country: 'US',
        email: storeOwner.email,
        controller: {
          dashboard: 'full',
          requirementCollection: 'stripe',
          feesPayer: 'account',
          lossesPayments: 'stripe',
        },
      },
    });

    if (row.deauthorizedAt) {
      throw new CodedHttpError(
        HttpStatus.CONFLICT,
        'PAYMENT_ACCOUNT_DEAUTHORIZED',
        'The Store payment account was deauthorized in Stripe and cannot be onboarded again automatically.',
      );
    }

    if (!row.accountId) {
      row =
        (await this.resolveCreation(row)) ??
        (await this.accounts.find(storeContext.storeId, this.environment))!;
      if (!row?.accountId) {
        throw this.providerUnavailable(
          'Stripe could not confirm account creation. Retry with the same key.',
        );
      }
    }

    try {
      const link = await this.gateway.createOnboardingLink(row.accountId);
      return {
        onboardingUrl: link.url,
        expiresAt: link.expiresAt.toISOString(),
      };
    } catch {
      throw this.providerUnavailable(
        'Stripe could not create an onboarding link. Retry with the same key.',
      );
    }
  }

  async refresh(storeContext: ActiveStoreContext) {
    const row = await this.accounts.find(
      storeContext.storeId,
      this.environment,
    );
    if (!row?.accountId || row.deauthorizedAt) return this.toConnection(row);

    try {
      const account = await this.gateway.retrieveConnectedAccount(
        row.accountId,
      );
      const updated = await this.accounts.updateReadiness(row.id, account);
      return this.toConnection(
        updated ?? (await this.accounts.find(row.storeId, row.environment)),
      );
    } catch {
      const [reviewed] = await this.accounts.markReadinessReviewRequired(
        row.id,
        'Connected account readiness could not be retrieved',
      );
      throw new CodedHttpError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PAYMENT_PROVIDER_UNAVAILABLE',
        'Stripe readiness could not be refreshed. Retry after the provider is available.',
        {
          connection: this.toConnection(
            reviewed ??
              (await this.accounts.find(row.storeId, row.environment)),
          ),
        },
      );
    }
  }

  async processAccountUpdated(
    accountId: string,
    environment: PaymentEnvironment,
  ) {
    const row = await this.findByAccountId(accountId, environment);
    if (!row) return false;
    if (row.deauthorizedAt) return true;
    try {
      const account = await this.gateway.retrieveConnectedAccount(accountId);
      await this.accounts.updateReadiness(row.id, account);
    } catch (error) {
      await this.accounts.recordReadinessSyncFailure(
        row.id,
        error instanceof Error
          ? error.message
          : 'Connected account readiness could not be retrieved',
      );
      // Throw so the durable webhook receipt is marked failed and the
      // recovery scheduler can retry the provider read.
      throw error;
    }
    return true;
  }

  async processAccountDeauthorized(
    accountId: string,
    environment: PaymentEnvironment,
  ) {
    const row = await this.findByAccountId(accountId, environment);
    if (!row) return false;
    await this.accounts.markDeauthorized(row.id);
    return true;
  }

  async recoverDueCreations(): Promise<void> {
    const candidates = await this.accounts.findDueCreationRecoveries(
      this.environment,
    );
    await Promise.all(
      candidates.map((candidate) =>
        this.resolveCreation(candidate).catch(() => undefined),
      ),
    );
  }

  private async resolveCreation(
    row: StorePaymentAccount | undefined,
  ): Promise<StorePaymentAccount | undefined> {
    if (!row || row.accountId) return row;

    if (row.creationStatus === 'review_required') {
      throw this.providerUnavailable(
        'Payment account creation needs operator review before it can be retried.',
      );
    }

    const claim = await this.accounts.claimCreation(row.id);
    if (!claim) {
      throw this.providerUnavailable(
        'Payment account creation is already being resolved. Retry with the same key.',
      );
    }

    if (
      claim.row.creationDispatchedAt &&
      !this.isProviderRetrySafe(claim.row.creationDispatchedAt)
    ) {
      await this.accounts.markCreationReviewRequired(
        claim.row.id,
        'Stripe idempotency protection may have expired before account creation was confirmed.',
        claim.leaseToken,
        claim.row.creationDispatchedAt,
      );
      throw this.providerUnavailable(
        'Payment account creation needs operator review because its safe retry window expired.',
      );
    }

    const dispatched = await this.accounts.markCreationDispatched(
      claim.row.id,
      claim.leaseToken,
    );
    if (!dispatched) {
      throw this.providerUnavailable(
        'Payment account creation is already being resolved. Retry with the same key.',
      );
    }

    let request: Omit<CreateConnectedAccountInput, 'idempotencyKey'>;
    try {
      request = this.frozenCreationRequest(claim.row.frozenCreationRequest);
    } catch (error) {
      await this.accounts.markCreationReviewRequired(
        claim.row.id,
        error instanceof Error
          ? error.message
          : 'Invalid frozen creation request',
        claim.leaseToken,
        dispatched.creationDispatchedAt,
      );
      throw this.providerUnavailable(
        'Payment account creation needs operator review because its saved request is invalid.',
      );
    }

    try {
      const account = await this.gateway.createConnectedAccount({
        ...request,
        idempotencyKey: claim.row.creationProviderKey,
      });
      const persisted = await this.accounts.markCreationSucceeded(
        claim.row.id,
        claim.leaseToken,
        account,
      );
      const current =
        persisted ??
        (await this.accounts.find(claim.row.storeId, claim.row.environment));
      if (!current?.accountId) {
        throw new Error('Connected account result was not persisted');
      }
      return current;
    } catch (error) {
      await this.accounts.markCreationFailure(
        claim.row.id,
        claim.leaseToken,
        error instanceof Error ? error.message : 'Unknown provider error',
        claim.row.retryCount,
      );
      throw this.providerUnavailable(
        'Stripe could not confirm account creation. Retry with the same key.',
      );
    }
  }

  private frozenCreationRequest(
    value: Record<string, unknown>,
  ): Omit<CreateConnectedAccountInput, 'idempotencyKey'> {
    const country = value.country;
    const email = value.email;
    if (typeof country !== 'string' || !country) {
      throw new Error('Saved payment account country is invalid');
    }
    if (email !== undefined && typeof email !== 'string') {
      throw new Error('Saved payment account email is invalid');
    }
    return { country, ...(email === undefined ? {} : { email }) };
  }

  private isProviderRetrySafe(firstDispatchedAt: Date): boolean {
    return (
      Date.now() - firstDispatchedAt.getTime() <
      CREATION_IDEMPOTENCY_SAFETY_WINDOW_MS
    );
  }

  private async findStoreOwner(storeId: string) {
    const [result] = await this.db
      .select({ storeId: store.id, email: user.email })
      .from(store)
      .innerJoin(user, eq(user.id, store.ownerId))
      .where(eq(store.id, storeId))
      .limit(1);
    return result;
  }

  private async findByAccountId(
    accountId: string,
    environment: PaymentEnvironment,
  ) {
    return this.db.query.storePaymentAccounts.findFirst({
      where: and(
        eq(schema.storePaymentAccounts.accountId, accountId),
        eq(schema.storePaymentAccounts.environment, environment),
      ),
    });
  }

  private toConnection(
    row: Awaited<ReturnType<StorePaymentAccountsRepository['find']>>,
  ) {
    if (!row) {
      return {
        connected: false,
        ready: false,
        status: StorePaymentConnectionStatus.NOT_CONNECTED,
        chargesEnabled: false,
        payoutsEnabled: false,
        cardPaymentsActive: false,
        requirementsDue: [],
        disabledReason: null,
        checkedAt: null,
      } satisfies StorePaymentConnectionResponseDto;
    }

    const ready =
      Boolean(row.accountId) &&
      row.deauthorizedAt === null &&
      row.chargesEnabled &&
      row.payoutsEnabled &&
      row.cardPaymentsActive;
    let status: StorePaymentConnectionStatus;
    if (row.deauthorizedAt) status = StorePaymentConnectionStatus.DEAUTHORIZED;
    else if (row.creationStatus === 'review_required')
      status = StorePaymentConnectionStatus.REVIEW_REQUIRED;
    else if (!row.accountId && row.creationStatus === 'creating')
      status = StorePaymentConnectionStatus.CREATING;
    else if (!row.accountId)
      status = StorePaymentConnectionStatus.NOT_CONNECTED;
    else if (ready) status = StorePaymentConnectionStatus.READY;
    else if (!row.detailsSubmitted)
      status = StorePaymentConnectionStatus.ONBOARDING_REQUIRED;
    else status = StorePaymentConnectionStatus.RESTRICTED;

    return {
      connected: Boolean(row.accountId),
      ready,
      status,
      chargesEnabled: row.chargesEnabled,
      payoutsEnabled: row.payoutsEnabled,
      cardPaymentsActive: row.cardPaymentsActive,
      requirementsDue: row.requirementsDue,
      disabledReason: row.disabledReason,
      checkedAt: row.checkedAt?.toISOString() ?? null,
    } satisfies StorePaymentConnectionResponseDto;
  }

  private get environment(): PaymentEnvironment {
    return this.config.connectSandboxMode ? 'sandbox' : 'live';
  }

  private requireIdempotencyKey(
    key: string | undefined,
  ): asserts key is string {
    if (!key || key.length > 128 || /[^\x20-\x7E]/.test(key)) {
      throw new CodedHttpError(
        HttpStatus.BAD_REQUEST,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key must contain 1–128 printable ASCII characters.',
      );
    }
  }

  private providerUnavailable(message: string) {
    return new CodedHttpError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'PAYMENT_PROVIDER_UNAVAILABLE',
      message,
    );
  }
}
