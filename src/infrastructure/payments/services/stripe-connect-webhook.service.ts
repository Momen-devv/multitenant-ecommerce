import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type Stripe from 'stripe';
import { stripeConfig } from '@/core/config';
import { CodedHttpError } from '@/common/errors';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { PaymentEventsRepository } from '../repos/payment-events.repository';
import type { PaymentEnvironment } from '../payment-environment';
import { ConnectWebhookQueueService } from '@/infrastructure/queue/connect-webhook/connect-webhook-queue.service';
import { STRIPE_CLIENT } from '../stripe/stripe.constants';
import {
  CONNECT_ACCOUNT_EVENT_HANDLER,
  type ConnectAccountEventHandler,
} from '../connect-account-event-handler';
import {
  CONNECT_PURCHASE_EVENT_HANDLER,
  type ConnectPurchaseEventHandler,
} from '../connect-purchase-event-handler';

const ACCOUNT_EVENT_TYPES = new Set([
  'account.updated',
  'account.application.deauthorized',
]);
const PURCHASE_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'refund.created',
  'refund.updated',
  'refund.failed',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
]);

@Injectable()
export class StripeConnectWebhookService {
  constructor(
    @Inject(stripeConfig.KEY)
    private readonly config: ConfigType<typeof stripeConfig>,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly events: PaymentEventsRepository,
    private readonly queue: ConnectWebhookQueueService,
    @Inject(CONNECT_ACCOUNT_EVENT_HANDLER)
    private readonly accountEvents: ConnectAccountEventHandler,
    @Inject(CONNECT_PURCHASE_EVENT_HANDLER)
    private readonly purchaseEvents: ConnectPurchaseEventHandler,
    private readonly logger: LoggerService,
  ) {}

  async receive(rawBody: Buffer, signature: string): Promise<void> {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.connectWebhookSecret,
      );
    } catch {
      throw new BadRequestException('Invalid Stripe Connect webhook signature');
    }

    if (event.livemode !== !this.config.connectSandboxMode) {
      throw new CodedHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_INPUT',
        'Stripe Connect event mode does not match the configured payment environment.',
      );
    }

    const accountId = this.getAccountId(event);
    if (!accountId) {
      throw new CodedHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_INPUT',
        'Stripe Connect event does not identify a connected account.',
      );
    }

    let stored: Awaited<ReturnType<PaymentEventsRepository['store']>>;
    try {
      stored = await this.events.store({
        environment: this.environment,
        accountId,
        stripeEventId: event.id,
        eventType: event.type,
        payload: event as unknown as Record<string, unknown>,
      });
    } catch {
      throw new CodedHttpError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PAYMENT_PROVIDER_UNAVAILABLE',
        'The Connect webhook could not be durably stored. Stripe should retry the event.',
      );
    }

    if (stored.status === 'completed' || stored.status === 'dead_letter')
      return;

    if (
      ACCOUNT_EVENT_TYPES.has(event.type) ||
      PURCHASE_EVENT_TYPES.has(event.type)
    ) {
      try {
        await this.queue.enqueueEvent(stored.id);
      } catch (error) {
        this.logger.error(
          `Failed to enqueue Connect webhook receipt ${stored.id}`,
          error,
          StripeConnectWebhookService.name,
        );
      }
    } else if (!PURCHASE_EVENT_TYPES.has(event.type)) {
      await this.events.completeUnclaimed(stored.id);
    }
  }

  async processEvent(eventId: string): Promise<void> {
    const claimed = await this.events.claim(eventId, [
      ...ACCOUNT_EVENT_TYPES,
      ...PURCHASE_EVENT_TYPES,
    ]);
    if (!claimed) return;
    const leaseToken = claimed.leaseToken;
    if (!leaseToken) throw new Error('Connect webhook claim has no lease');

    const event = claimed.payload as unknown as Stripe.Event;
    try {
      if (ACCOUNT_EVENT_TYPES.has(event.type)) {
        if (event.type === 'account.updated') {
          await this.accountEvents.processAccountUpdated(
            claimed.accountId,
            this.environment,
          );
        } else {
          await this.accountEvents.processAccountDeauthorized(
            claimed.accountId,
            this.environment,
          );
        }
      } else if (PURCHASE_EVENT_TYPES.has(event.type)) {
        await this.purchaseEvents.processPurchaseEvent({
          accountId: claimed.accountId,
          environment: this.environment,
          eventType: event.type,
          payload: claimed.payload,
        });
      }

      await this.events.complete(eventId, leaseToken);
    } catch (error) {
      await this.events.fail(
        eventId,
        leaseToken,
        error instanceof Error ? error.message : String(error),
        this.nextRetryAt(claimed.attempts),
      );
      throw error;
    }
  }

  async recoverDueEvents(): Promise<void> {
    const ids = await this.events.dueIds([
      ...ACCOUNT_EVENT_TYPES,
      ...PURCHASE_EVENT_TYPES,
    ]);
    await Promise.all(
      ids.map((eventId) =>
        this.queue
          .enqueueEvent(eventId)
          .catch((error) =>
            this.logger.error(
              `Failed to enqueue Connect webhook recovery ${eventId}`,
              error,
              StripeConnectWebhookService.name,
            ),
          ),
      ),
    );
  }

  private getAccountId(event: Stripe.Event): string | undefined {
    if (typeof event.account === 'string') return event.account;
    if (event.type === 'account.updated') {
      const object = event.data.object;
      return object.id;
    }
    return undefined;
  }

  private get environment(): PaymentEnvironment {
    return this.config.connectSandboxMode ? 'sandbox' : 'live';
  }

  private nextRetryAt(attempts: number): Date {
    const delays = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
    return new Date(
      Date.now() +
        delays[Math.min(Math.max(attempts - 1, 0), delays.length - 1)],
    );
  }
}
