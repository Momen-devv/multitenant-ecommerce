import { Inject, Injectable } from '@nestjs/common';
import { stripeConfig } from '@/core/config';
import type { ConfigType } from '@nestjs/config';
import type Stripe from 'stripe';
import {
  AccountOnboardingLink,
  CheckoutSession,
  ConnectedAccount,
  CreateCheckoutSessionInput,
  CreateConnectedAccountInput,
  CreateRefundInput,
  PaymentCharge,
  PaymentGateway,
  PaymentIntent,
  PaymentRefund,
} from '../payment-gateway.interface';
import { STRIPE_CLIENT } from './stripe.constants';

@Injectable()
export class StripePaymentGateway implements PaymentGateway {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    @Inject(stripeConfig.KEY)
    private readonly config: ConfigType<typeof stripeConfig>,
  ) {}

  async createConnectedAccount(
    input: CreateConnectedAccountInput,
  ): Promise<ConnectedAccount> {
    const account = await this.stripe.accounts.create(
      {
        country: input.country,
        email: input.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        controller: {
          stripe_dashboard: { type: 'full' },
          requirement_collection: 'stripe',
          fees: { payer: 'account' },
          losses: { payments: 'stripe' },
        },
      },
      { idempotencyKey: input.idempotencyKey },
    );

    return this.normalizeAccount(account);
  }

  async retrieveConnectedAccount(accountId: string): Promise<ConnectedAccount> {
    return this.normalizeAccount(
      await this.stripe.accounts.retrieve(accountId),
    );
  }

  async createOnboardingLink(
    accountId: string,
  ): Promise<AccountOnboardingLink> {
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: this.returnUrl,
      refresh_url: this.refreshUrl,
    });

    return { url: link.url, expiresAt: new Date(link.expires_at * 1000) };
  }

  async createCheckoutSession(
    accountId: string,
    input: CreateCheckoutSessionInput,
    idempotencyKey: string,
  ): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: input.mode,
        customer: input.customerId,
        customer_email: input.customerEmail,
        line_items: input.lineItems.map((item) => ({
          ...(item.priceId ? { price: item.priceId } : {}),
          ...(item.priceData
            ? {
                price_data: {
                  currency: item.priceData.currency,
                  unit_amount: item.priceData.unitAmount,
                  product_data: {
                    name: item.priceData.productName,
                    description: item.priceData.productDescription,
                  },
                },
              }
            : {}),
          quantity: item.quantity,
        })),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: input.metadata,
        payment_intent_data: input.paymentIntentMetadata
          ? { metadata: input.paymentIntentMetadata }
          : undefined,
        payment_method_types: input.mode === 'payment' ? ['card'] : undefined,
        automatic_tax:
          input.mode === 'payment' ? { enabled: false } : undefined,
        allow_promotion_codes: input.mode === 'payment' ? false : undefined,
        subscription_data: input.subscriptionMetadata
          ? { metadata: input.subscriptionMetadata }
          : undefined,
        expires_at: input.expiresAt
          ? Math.floor(input.expiresAt.getTime() / 1000)
          : undefined,
      },
      { stripeAccount: accountId, idempotencyKey },
    );
    return this.normalizeCheckoutSession(session);
  }

  async retrieveCheckoutSession(
    accountId: string,
    sessionId: string,
  ): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.retrieve(
      sessionId,
      {},
      { stripeAccount: accountId },
    );
    return this.normalizeCheckoutSession(session);
  }

  async expireCheckoutSession(
    accountId: string,
    sessionId: string,
  ): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.expire(
      sessionId,
      {},
      { stripeAccount: accountId },
    );
    return this.normalizeCheckoutSession(session);
  }

  async retrievePaymentIntent(
    accountId: string,
    paymentIntentId: string,
  ): Promise<PaymentIntent> {
    const intent = await this.stripe.paymentIntents.retrieve(
      paymentIntentId,
      {},
      { stripeAccount: accountId },
    );
    return {
      id: intent.id,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
      chargeId: this.expandableId(intent.latest_charge),
      metadata: intent.metadata,
    };
  }

  async retrieveCharge(
    accountId: string,
    chargeId: string,
  ): Promise<PaymentCharge> {
    const charge = await this.stripe.charges.retrieve(
      chargeId,
      {},
      { stripeAccount: accountId },
    );
    return {
      id: charge.id,
      amount: charge.amount,
      currency: charge.currency,
      paymentIntentId: this.expandableId(charge.payment_intent),
      status: charge.status,
      refunded: charge.refunded,
      refundedAmount: charge.amount_refunded,
    };
  }

  async createRefund(
    accountId: string,
    input: CreateRefundInput,
    idempotencyKey: string,
  ): Promise<PaymentRefund> {
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: input.paymentIntentId,
        charge: input.chargeId,
        amount: input.amount,
        reason: input.reason,
        metadata: input.metadata,
      },
      { stripeAccount: accountId, idempotencyKey },
    );
    return this.normalizeRefund(refund);
  }

  async retrieveRefund(
    accountId: string,
    refundId: string,
  ): Promise<PaymentRefund> {
    const refund = await this.stripe.refunds.retrieve(
      refundId,
      {},
      { stripeAccount: accountId },
    );
    return this.normalizeRefund(refund);
  }

  private normalizeCheckoutSession(
    session: Stripe.Checkout.Session,
  ): CheckoutSession {
    return {
      id: session.id,
      url: session.url,
      status: session.status,
      paymentStatus: session.payment_status,
      paymentIntentId: this.expandableId(session.payment_intent),
      subscriptionId: this.expandableId(session.subscription),
      expiresAt: session.expires_at
        ? new Date(session.expires_at * 1000)
        : null,
      metadata: session.metadata ?? {},
    };
  }

  private normalizeRefund(refund: Stripe.Refund): PaymentRefund {
    return {
      id: refund.id,
      status: refund.status,
      amount: refund.amount,
      currency: refund.currency,
      paymentIntentId: this.expandableId(refund.payment_intent),
      chargeId: this.expandableId(refund.charge),
    };
  }

  private expandableId(
    value: string | { id: string } | null | undefined,
  ): string | null {
    if (!value) return null;
    return typeof value === 'string' ? value : value.id;
  }

  private get returnUrl(): string {
    return this.config.connectOnboardingReturnUrl;
  }

  private get refreshUrl(): string {
    return this.config.connectOnboardingRefreshUrl;
  }

  private normalizeAccount(account: Stripe.Account): ConnectedAccount {
    const cardPayments = account.capabilities?.card_payments;
    return {
      id: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      cardPaymentsActive: cardPayments === 'active',
      detailsSubmitted: account.details_submitted,
      requirementsDue: account.requirements?.currently_due ?? [],
      disabledReason: this.sanitizeDisabledReason(account),
      deauthorized: false,
    };
  }

  private sanitizeDisabledReason(account: Stripe.Account): string | null {
    if (!account.requirements?.disabled_reason) return null;
    if (account.requirements.currently_due?.length) {
      return 'Stripe requires additional account information before payments can be enabled.';
    }
    return 'Stripe has restricted this payment account. Complete the outstanding Stripe requirements.';
  }
}
