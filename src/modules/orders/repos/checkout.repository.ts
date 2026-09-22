import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CodedHttpError } from '@/common/errors';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import {
  InventoryPolicy,
  ProductStatus,
  ProductVariantStatus,
  StoreStatus,
  SubscriptionStatus,
} from '@/common/enums';
import * as schema from '@/infrastructure/database/schema/schema';
import { user } from '@/infrastructure/database/schema/auth.schema';
import {
  store,
  storeCheckoutSettings,
  userAddresses,
} from '@/infrastructure/database/schema/app.schema';
import {
  carts,
  cartItems,
} from '@/infrastructure/database/schema/carts.schema';
import {
  products,
  productVariants,
} from '@/infrastructure/database/schema/products.schema';
import { subscriptions } from '@/infrastructure/database/schema/billing.schema';
import { storePaymentAccounts } from '@/infrastructure/database/schema/store-payments.schema';
import {
  checkoutAttempts,
  checkoutQuotes,
  checkoutReservations,
  commerceCommands,
  orderEvents,
  orderItems,
  orders,
  type CheckoutSnapshot,
} from '@/infrastructure/database/schema/orders.schema';
import { outboxEvents } from '@/infrastructure/database/schema/outbox.schema';
import { OutboxEventType } from '@/common/enums/outbox-event-type.enum';
import type {
  CreateCheckoutQuoteDto,
  CheckoutQueryDto,
  StartCheckoutDto,
} from '../dto';
import { PAYMENT_GATEWAY } from '@/infrastructure/payments/payment.tokens';
import type {
  PaymentGateway,
  CheckoutSession,
} from '@/infrastructure/payments/payment-gateway.interface';
import { stripeConfig } from '@/core/config';
import type { ConfigType } from '@nestjs/config';
import { generateUUIDv7 } from '@/common/utils';
import type { PaymentEnvironment } from '@/infrastructure/payments/payment-environment';

type Database = NodePgDatabase<typeof schema>;
const QUOTE_MS = 5 * 60 * 1000;
const MAX_TOTAL = 99_999_999;
const MIN_TOTAL = 50;
const PROVIDER_LEASE_MS = 5 * 60 * 1000;
const PROVIDER_MAX_ATTEMPTS = 10;
const PROVIDER_IDEMPOTENCY_SAFETY_WINDOW_MS = 23 * 60 * 60 * 1000;

@Injectable()
export class CheckoutRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(stripeConfig.KEY)
    private readonly stripe: ConfigType<typeof stripeConfig>,
  ) {}

  async quote(userId: string, storeId: string, dto: CreateCheckoutQuoteDto) {
    return await this.db.transaction(async (tx) => {
      const snapshot = await this.buildSnapshot(
        tx,
        userId,
        storeId,
        dto.addressId,
        dto.paymentMethod,
        dto.version,
        false,
      );
      const expiresAt = new Date(Date.now() + QUOTE_MS);
      const [quote] = await tx
        .insert(checkoutQuotes)
        .values({
          userId,
          storeId,
          cartId: snapshot.cartId,
          cartVersion: snapshot.cartVersion,
          snapshot,
          snapshotHash: this.hash(snapshot),
          expiresAt,
        })
        .returning();
      if (!quote) throw new Error('Quote was not persisted.');
      return {
        id: quote.id,
        expiresAt,
        cartVersion: snapshot.cartVersion,
        currency: snapshot.currency,
        paymentMethod: snapshot.paymentMethod,
        items: snapshot.items,
        subtotal: snapshot.subtotal,
        shippingFee: snapshot.shippingFee,
        total: snapshot.total,
        accountContact: snapshot.accountContact,
        shippingAddress: snapshot.shippingAddress,
        shippingPolicy: snapshot.shippingPolicy,
      };
    });
  }

  async start(
    userId: string,
    storeId: string,
    dto: StartCheckoutDto,
    idempotencyKey: string | undefined,
  ) {
    const quote = await this.db.query.checkoutQuotes.findFirst({
      where: and(
        eq(checkoutQuotes.id, dto.quoteId),
        eq(checkoutQuotes.userId, userId),
        eq(checkoutQuotes.storeId, storeId),
      ),
      columns: { snapshot: true },
    });
    if (quote?.snapshot.paymentMethod === 'online') {
      return this.startOnline(userId, storeId, dto, idempotencyKey);
    }
    return this.startCashOnDelivery(userId, storeId, dto, idempotencyKey);
  }

  private async startCashOnDelivery(
    userId: string,
    storeId: string,
    dto: StartCheckoutDto,
    idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey || !/^[\x20-\x7e]{1,128}$/.test(idempotencyKey)) {
      throw new CodedHttpError(
        HttpStatus.BAD_REQUEST,
        'IDEMPOTENCY_KEY_REQUIRED',
        'A printable Idempotency-Key header is required.',
      );
    }
    const requestHash = this.hash({ quoteId: dto.quoteId });
    return this.db.transaction(async (tx) => {
      const [command] = await tx
        .select()
        .from(commerceCommands)
        .where(
          and(
            eq(commerceCommands.actorUserId, userId),
            eq(commerceCommands.operation, 'start-checkout'),
            eq(commerceCommands.resourceId, storeId),
            eq(commerceCommands.idempotencyKey, idempotencyKey),
          ),
        )
        .for('update');
      if (command) {
        if (command.requestHash !== requestHash)
          throw new CodedHttpError(
            HttpStatus.CONFLICT,
            'IDEMPOTENCY_CONFLICT',
            'This Idempotency-Key was already used with a different request.',
          );
        return await this.attemptResponse(tx, userId, command.attemptId!);
      }
      const [quote] = await tx
        .select()
        .from(checkoutQuotes)
        .where(
          and(
            eq(checkoutQuotes.id, dto.quoteId),
            eq(checkoutQuotes.userId, userId),
            eq(checkoutQuotes.storeId, storeId),
          ),
        )
        .for('update');
      if (!quote)
        throw new CodedHttpError(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Resource not found.',
        );
      if (quote.consumedAt || quote.expiresAt <= new Date())
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'QUOTE_EXPIRED',
          'This checkout quote has expired. Create a new quote.',
        );
      const snapshot = await this.buildSnapshot(
        tx,
        userId,
        storeId,
        quote.snapshot.shippingAddress
          ? await this.ownedAddressId(
              tx,
              userId,
              quote.snapshot.shippingAddress,
            )
          : '',
        quote.snapshot.paymentMethod,
        quote.cartVersion,
        true,
      );
      if (this.hash(snapshot) !== quote.snapshotHash)
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'QUOTE_CHANGED',
          'Purchase details changed. Review a new quote.',
        );
      const [cart] = await tx
        .select()
        .from(carts)
        .where(
          and(
            eq(carts.id, quote.cartId),
            eq(carts.userId, userId),
            eq(carts.storeId, storeId),
          ),
        )
        .for('update');
      if (!cart)
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'QUOTE_CHANGED',
          'The Cart changed. Review a new quote.',
        );
      const [existing] = await tx
        .select({ id: checkoutAttempts.id })
        .from(checkoutAttempts)
        .where(
          and(
            eq(checkoutAttempts.cartId, cart.id),
            inArray(checkoutAttempts.status, [
              'creating',
              'pending',
              'cancelling',
            ]),
          ),
        )
        .for('update');
      if (existing)
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'CART_LOCKED',
          'This Cart already has an active checkout.',
        );
      const [attempt] = await tx
        .insert(checkoutAttempts)
        .values({
          userId,
          storeId,
          cartId: cart.id,
          quoteId: quote.id,
          quoteReferenceId: quote.id,
          paymentMethod: 'cash_on_delivery',
          status: 'succeeded',
          snapshot,
          idempotencyKey,
          requestHash,
        })
        .returning();
      if (!attempt) throw new Error('Checkout attempt was not persisted.');
      await this.reserve(tx, attempt.id, storeId, snapshot);
      const [order] = await tx
        .insert(orders)
        .values({
          attemptId: attempt.id,
          storeId,
          userId,
          status: 'placed',
          paymentMethod: 'cash_on_delivery',
          paymentStatus: 'unpaid',
          version: 1,
          currency: 'usd',
          subtotal: snapshot.subtotal,
          shippingFee: snapshot.shippingFee,
          total: snapshot.total,
          accountEmail: snapshot.accountContact.email,
          accountPhone: snapshot.accountContact.phoneNumber,
          shippingAddress: snapshot.shippingAddress,
          shippingPolicy: snapshot.shippingPolicy,
        })
        .returning();
      if (!order) throw new Error('Order was not persisted.');
      await tx.insert(orderItems).values(
        snapshot.items.map((item) => ({
          orderId: order.id,
          storeId,
          productId: item.productId,
          variantId: item.variantId,
          name: item.name,
          variantTitle: item.variantTitle,
          sku: item.sku,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
          inventoryPolicy: item.inventoryPolicy as InventoryPolicy,
        })),
      );
      await tx
        .update(checkoutReservations)
        .set({ orderId: order.id, updatedAt: new Date() })
        .where(eq(checkoutReservations.attemptId, attempt.id));
      await tx.insert(orderEvents).values({
        orderId: order.id,
        storeId,
        version: 1,
        kind: 'placed',
        previousStatus: null,
        nextStatus: 'placed',
        actorAuthority: 'shopper',
        actorUserId: userId,
      });
      // Ticket 08 owns dispatch; preserving this intent makes placement durable
      // without letting an email outage roll back financial/inventory state.
      await tx.insert(outboxEvents).values({
        eventType: OutboxEventType.ORDER_EMAIL_INTENT,
        aggregateId: order.id,
        deduplicationKey: `${order.id}:placed:1`,
        payload: {
          type: 'placed',
          orderId: order.id,
          version: 1,
          to: snapshot.accountContact.email,
          total: snapshot.total,
          currency: snapshot.currency,
        },
      });
      await tx
        .update(checkoutQuotes)
        .set({ consumedAt: new Date() })
        .where(eq(checkoutQuotes.id, quote.id));
      await tx.delete(carts).where(eq(carts.id, cart.id));
      await tx.insert(commerceCommands).values({
        actorUserId: userId,
        operation: 'start-checkout',
        resourceId: storeId,
        idempotencyKey,
        requestHash,
        attemptId: attempt.id,
        orderId: order.id,
      });
      return await this.attemptResponse(tx, userId, attempt.id);
    });
  }

  private async startOnline(
    userId: string,
    storeId: string,
    dto: StartCheckoutDto,
    idempotencyKey: string | undefined,
  ) {
    this.requireIdempotencyKey(idempotencyKey);
    const requestHash = this.hash({ quoteId: dto.quoteId });

    // Replay is deliberately checked before a fresh provider read. A completed
    // purchase must remain rediscoverable if Stripe is temporarily unavailable.
    const replay = await this.db.query.commerceCommands.findFirst({
      where: and(
        eq(commerceCommands.actorUserId, userId),
        eq(commerceCommands.operation, 'start-checkout'),
        eq(commerceCommands.resourceId, storeId),
        eq(commerceCommands.idempotencyKey, idempotencyKey),
      ),
    });
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'IDEMPOTENCY_CONFLICT',
          'This Idempotency-Key was already used with a different request.',
        );
      }
      return this.attemptResponse(this.db, userId, replay.attemptId!);
    }

    const accountId = await this.freshOnlineAccount(storeId);
    const attemptId = await this.db.transaction(async (tx) => {
      const [command] = await tx
        .select()
        .from(commerceCommands)
        .where(
          and(
            eq(commerceCommands.actorUserId, userId),
            eq(commerceCommands.operation, 'start-checkout'),
            eq(commerceCommands.resourceId, storeId),
            eq(commerceCommands.idempotencyKey, idempotencyKey),
          ),
        )
        .for('update');
      if (command) {
        if (command.requestHash !== requestHash) {
          throw new CodedHttpError(
            HttpStatus.CONFLICT,
            'IDEMPOTENCY_CONFLICT',
            'This Idempotency-Key was already used with a different request.',
          );
        }
        return command.attemptId!;
      }
      const [quote] = await tx
        .select()
        .from(checkoutQuotes)
        .where(
          and(
            eq(checkoutQuotes.id, dto.quoteId),
            eq(checkoutQuotes.userId, userId),
            eq(checkoutQuotes.storeId, storeId),
          ),
        )
        .for('update');
      if (!quote) {
        throw new CodedHttpError(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Resource not found.',
        );
      }
      if (quote.consumedAt || quote.expiresAt <= new Date()) {
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'QUOTE_EXPIRED',
          'This checkout quote has expired. Create a new quote.',
        );
      }
      if (quote.snapshot.paymentMethod !== 'online') {
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'PAYMENT_METHOD_UNAVAILABLE',
          'This quote is not for online payment.',
        );
      }
      const snapshot = await this.buildSnapshot(
        tx,
        userId,
        storeId,
        await this.ownedAddressId(tx, userId, quote.snapshot.shippingAddress),
        'online',
        quote.cartVersion,
        true,
      );
      if (this.hash(snapshot) !== quote.snapshotHash) {
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'QUOTE_CHANGED',
          'Purchase details changed. Review a new quote.',
        );
      }
      const [cart] = await tx
        .select()
        .from(carts)
        .where(and(eq(carts.id, quote.cartId), eq(carts.userId, userId)))
        .for('update');
      if (!cart) {
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'QUOTE_CHANGED',
          'The Cart changed. Review a new quote.',
        );
      }
      const [active] = await tx
        .select({ id: checkoutAttempts.id })
        .from(checkoutAttempts)
        .where(
          and(
            eq(checkoutAttempts.cartId, cart.id),
            inArray(checkoutAttempts.status, [
              'creating',
              'pending',
              'cancelling',
            ]),
          ),
        )
        .for('update');
      if (active) {
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'CART_LOCKED',
          'This Cart already has an active checkout.',
        );
      }
      const [attempt] = await tx
        .insert(checkoutAttempts)
        .values({
          userId,
          storeId,
          cartId: cart.id,
          quoteId: quote.id,
          quoteReferenceId: quote.id,
          paymentMethod: 'online',
          status: 'creating',
          snapshot,
          idempotencyKey,
          requestHash,
          connectedAccountId: accountId,
          paymentEnvironment: this.stripe.connectSandboxMode
            ? 'sandbox'
            : 'live',
          providerRequestKey: `checkout-${storeId}-${quote.id}`,
          providerRequest: {
            version: 1,
            customerEmail: snapshot.accountContact.email,
            lineItems: snapshot.items.map((item) => ({
              quantity: item.quantity,
              unitAmount: item.unitPrice,
              productName: item.name,
              productDescription: item.variantTitle,
            })),
            shippingFee: snapshot.shippingFee,
            successUrl: this.stripe.checkoutSuccessUrl,
            cancelUrl: this.stripe.checkoutCancelUrl,
          },
        })
        .returning({ id: checkoutAttempts.id });
      if (!attempt) throw new Error('Checkout attempt was not persisted.');
      await this.reserve(tx, attempt.id, storeId, snapshot);
      await tx
        .update(checkoutQuotes)
        .set({ consumedAt: new Date() })
        .where(eq(checkoutQuotes.id, quote.id));
      await tx.insert(commerceCommands).values({
        actorUserId: userId,
        operation: 'start-checkout',
        resourceId: storeId,
        idempotencyKey,
        requestHash,
        attemptId: attempt.id,
      });
      return attempt.id;
    });

    // This is only an eager execution hint. The persisted job is authoritative:
    // an outage or crash leaves the attempt recoverable and its Cart locked.
    await this.processOnlineAttempt(attemptId, true);
    return this.attemptResponse(this.db, userId, attemptId);
  }

  async listAttempts(userId: string, query: CheckoutQueryDto) {
    const limit = query.limit ?? 20;
    const where = [eq(checkoutAttempts.userId, userId)];
    if (query['filter[storeId][eq]'])
      where.push(eq(checkoutAttempts.storeId, query['filter[storeId][eq]']));
    if (query['filter[status][eq]'])
      where.push(
        eq(checkoutAttempts.status, query['filter[status][eq]'] as never),
      );
    const rows = await this.db
      .select()
      .from(checkoutAttempts)
      .where(and(...where))
      .orderBy(desc(checkoutAttempts.createdAt), desc(checkoutAttempts.id))
      .limit(limit + 1);
    const items = await Promise.all(
      rows
        .slice(0, limit)
        .map((x) => this.attemptResponse(this.db, userId, x.id)),
    );
    return {
      items,
      pageInfo: { nextCursor: null, hasNextPage: rows.length > limit },
    };
  }
  async attemptDetail(userId: string, attemptId: string) {
    return await this.attemptResponse(this.db, userId, attemptId);
  }

  async cancelAttempt(
    userId: string,
    attemptId: string,
    key: string | undefined,
  ) {
    this.requireIdempotencyKey(key);
    const requestHash = this.hash({});
    await this.db.transaction(async (tx) => {
      const [command] = await tx
        .select()
        .from(commerceCommands)
        .where(
          and(
            eq(commerceCommands.actorUserId, userId),
            eq(commerceCommands.operation, 'cancel-checkout'),
            eq(commerceCommands.resourceId, attemptId),
            eq(commerceCommands.idempotencyKey, key),
          ),
        )
        .for('update');
      if (command) {
        if (command.requestHash !== requestHash)
          throw new CodedHttpError(
            HttpStatus.CONFLICT,
            'IDEMPOTENCY_CONFLICT',
            'This Idempotency-Key was already used with a different request.',
          );
        return;
      }
      const [attempt] = await tx
        .select()
        .from(checkoutAttempts)
        .where(
          and(
            eq(checkoutAttempts.id, attemptId),
            eq(checkoutAttempts.userId, userId),
          ),
        )
        .for('update');
      if (!attempt)
        throw new CodedHttpError(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'Resource not found.',
        );
      const [order] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.attemptId, attemptId));
      if (order)
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'PAYMENT_ALREADY_COMPLETED',
          'Payment already completed.',
          { orderId: order.id },
        );
      if (['creating', 'pending'].includes(attempt.status)) {
        await tx
          .update(checkoutAttempts)
          .set({
            status: 'cancelling',
            nextRetryAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(checkoutAttempts.id, attemptId));
      }
      await tx.insert(commerceCommands).values({
        actorUserId: userId,
        operation: 'cancel-checkout',
        resourceId: attemptId,
        idempotencyKey: key,
        requestHash,
        attemptId,
      });
    });
    await this.processOnlineAttempt(attemptId, true);
    return this.attemptResponse(this.db, userId, attemptId);
  }

  private async releaseUnpaidAttempt(
    attemptId: string,
    status: 'cancelled' | 'expired' | 'failed',
  ) {
    await this.db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(checkoutAttempts)
        .where(eq(checkoutAttempts.id, attemptId))
        .for('update');
      if (
        !attempt ||
        ['succeeded', 'cancelled', 'expired', 'failed'].includes(attempt.status)
      )
        return;
      const reservations = await tx
        .select()
        .from(checkoutReservations)
        .where(
          and(
            eq(checkoutReservations.attemptId, attemptId),
            eq(checkoutReservations.disposition, 'held'),
          ),
        );
      for (const reservation of reservations) {
        if (reservation.inventoryPolicy === InventoryPolicy.TRACKED) {
          const [variant] = await tx
            .select()
            .from(productVariants)
            .where(eq(productVariants.id, reservation.variantId))
            .for('update');
          if (variant)
            await tx
              .update(productVariants)
              .set({
                reserved: Math.max(
                  0,
                  (variant.reserved ?? 0) - reservation.quantity,
                ),
                version: variant.version + 1,
                updatedAt: new Date(),
              })
              .where(eq(productVariants.id, variant.id));
        }
      }
      await tx
        .update(checkoutReservations)
        .set({ disposition: 'released', updatedAt: new Date() })
        .where(
          and(
            eq(checkoutReservations.attemptId, attemptId),
            eq(checkoutReservations.disposition, 'held'),
          ),
        );
      await tx
        .update(checkoutAttempts)
        .set({
          status,
          paymentUrl: null,
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(checkoutAttempts.id, attemptId));
      if (attempt.cartId)
        await tx
          .update(carts)
          .set({
            version: sql`${carts.version} + 1`,
            lastActivityAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(carts.id, attempt.cartId));
    });
  }

  private async freshOnlineAccount(storeId: string): Promise<string> {
    const environment = this.stripe.connectSandboxMode ? 'sandbox' : 'live';
    const account = await this.db.query.storePaymentAccounts.findFirst({
      where: and(
        eq(storePaymentAccounts.storeId, storeId),
        eq(storePaymentAccounts.environment, environment),
      ),
    });
    if (!account?.accountId || account.deauthorizedAt) {
      throw new CodedHttpError(
        HttpStatus.CONFLICT,
        'PAYMENT_ACCOUNT_NOT_READY',
        'The Store payment account is not ready for online checkout.',
      );
    }
    try {
      const remote = await this.gateway.retrieveConnectedAccount(
        account.accountId,
      );
      if (
        !remote.chargesEnabled ||
        !remote.payoutsEnabled ||
        !remote.cardPaymentsActive
      ) {
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'PAYMENT_ACCOUNT_NOT_READY',
          'The Store payment account is not ready for online checkout.',
        );
      }
      await this.db
        .update(storePaymentAccounts)
        .set({
          chargesEnabled: remote.chargesEnabled,
          payoutsEnabled: remote.payoutsEnabled,
          cardPaymentsActive: remote.cardPaymentsActive,
          detailsSubmitted: remote.detailsSubmitted,
          requirementsDue: remote.requirementsDue,
          disabledReason: remote.disabledReason,
          checkedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(storePaymentAccounts.id, account.id));
      return account.accountId;
    } catch (error) {
      if (error instanceof CodedHttpError) throw error;
      throw new CodedHttpError(
        HttpStatus.CONFLICT,
        'PAYMENT_ACCOUNT_NOT_READY',
        'The Store payment account could not be verified for online checkout.',
      );
    }
  }

  /** Called by the scheduler and by a durable Connect event receipt. */
  async recoverDueOnlineAttempts(): Promise<void> {
    const due = await this.db
      .select({ id: checkoutAttempts.id })
      .from(checkoutAttempts)
      .where(
        and(
          inArray(checkoutAttempts.status, [
            'creating',
            'pending',
            'cancelling',
          ]),
          eq(checkoutAttempts.paymentReviewRequired, false),
          lte(checkoutAttempts.nextRetryAt, new Date()),
        ),
      )
      .limit(100);
    await Promise.all(
      due.map((attempt) => this.processOnlineAttempt(attempt.id)),
    );
  }

  async processPurchaseEvent(input: {
    accountId: string;
    environment: PaymentEnvironment;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<boolean> {
    const expectedEnvironment = this.stripe.connectSandboxMode
      ? 'sandbox'
      : 'live';
    if (input.environment !== expectedEnvironment) return false;
    const object = (
      input.payload.data as { object?: Record<string, unknown> } | undefined
    )?.object;
    const objectId = typeof object?.id === 'string' ? object.id : undefined;
    const paymentIntentId =
      typeof object?.payment_intent === 'string'
        ? object.payment_intent
        : input.eventType.startsWith('payment_intent.')
          ? objectId
          : undefined;
    if (!objectId && !paymentIntentId) return false;
    const [attempt] = await this.db
      .select({ id: checkoutAttempts.id })
      .from(checkoutAttempts)
      .where(
        and(
          eq(checkoutAttempts.connectedAccountId, input.accountId),
          eq(checkoutAttempts.paymentEnvironment, input.environment),
          or(
            objectId
              ? eq(checkoutAttempts.checkoutSessionId, objectId)
              : sql`false`,
            paymentIntentId
              ? eq(checkoutAttempts.paymentIntentId, paymentIntentId)
              : sql`false`,
          ),
        ),
      )
      .limit(1);
    if (!attempt) return false;
    await this.processOnlineAttempt(attempt.id, true, true);
    return true;
  }

  private async processOnlineAttempt(
    attemptId: string,
    force = false,
    throwOnFailure = false,
  ): Promise<void> {
    const now = new Date();
    const leaseToken = generateUUIDv7();
    const [attempt] = await this.db
      .update(checkoutAttempts)
      .set({
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + PROVIDER_LEASE_MS),
        updatedAt: now,
      })
      .where(
        and(
          eq(checkoutAttempts.id, attemptId),
          inArray(checkoutAttempts.status, [
            'creating',
            'pending',
            'cancelling',
          ]),
          eq(checkoutAttempts.paymentReviewRequired, false),
          or(
            isNull(checkoutAttempts.leaseToken),
            lte(checkoutAttempts.leaseExpiresAt, now),
          ),
          force ? sql`true` : lte(checkoutAttempts.nextRetryAt, now),
        ),
      )
      .returning();
    if (!attempt) return;
    try {
      if (attempt.status === 'creating') {
        await this.createProviderSession(attempt, leaseToken);
      } else {
        await this.reconcileProviderSession(attempt, leaseToken);
      }
    } catch (error) {
      await this.recordProviderFailure(attempt, leaseToken, error);
      if (throwOnFailure) throw error;
    }
  }

  private async createProviderSession(
    attempt: typeof checkoutAttempts.$inferSelect,
    leaseToken: string,
  ): Promise<void> {
    if (
      attempt.paymentMethod !== 'online' ||
      attempt.checkoutSessionId ||
      !attempt.connectedAccountId ||
      !attempt.providerRequestKey
    ) {
      await this.finishAttemptWork(
        attempt.id,
        leaseToken,
        new Date(Date.now() + 60_000),
      );
      return;
    }
    if (
      attempt.providerDispatchedAt &&
      Date.now() - attempt.providerDispatchedAt.getTime() >
        PROVIDER_IDEMPOTENCY_SAFETY_WINDOW_MS
    ) {
      await this.markAttemptForReview(
        attempt.id,
        leaseToken,
        'Stripe session creation exceeded the safe idempotency retry window.',
      );
      return;
    }
    const savedExpiry = attempt.providerRequest?.expiresAt;
    const expiresAt =
      typeof savedExpiry === 'string' && !Number.isNaN(Date.parse(savedExpiry))
        ? new Date(savedExpiry)
        : new Date(Date.now() + 30 * 60 * 1000 + 5_000);
    const [dispatched] = await this.db
      .update(checkoutAttempts)
      .set({
        providerRequest: {
          ...(attempt.providerRequest ?? {}),
          expiresAt: expiresAt.toISOString(),
        },
        providerDispatchedAt: attempt.providerDispatchedAt ?? new Date(),
        providerAttempts: attempt.providerAttempts + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(checkoutAttempts.id, attempt.id),
          eq(checkoutAttempts.status, 'creating'),
          eq(checkoutAttempts.leaseToken, leaseToken),
        ),
      )
      .returning();
    if (!dispatched) {
      await this.finishAttemptWork(attempt.id, leaseToken, new Date());
      return;
    }
    const metadata = { attemptId: attempt.id, storeId: attempt.storeId };
    const session = await this.gateway.createCheckoutSession(
      attempt.connectedAccountId,
      {
        mode: 'payment',
        customerEmail: attempt.snapshot.accountContact.email,
        lineItems: [
          ...attempt.snapshot.items.map((item) => ({
            quantity: item.quantity,
            priceData: {
              currency: 'usd' as const,
              unitAmount: item.unitPrice,
              productName: item.name,
              productDescription: item.variantTitle,
            },
          })),
          ...(attempt.snapshot.shippingFee > 0
            ? [
                {
                  quantity: 1,
                  priceData: {
                    currency: 'usd' as const,
                    unitAmount: attempt.snapshot.shippingFee,
                    productName: 'Shipping',
                  },
                },
              ]
            : []),
        ],
        successUrl: this.stripe.checkoutSuccessUrl,
        cancelUrl: this.stripe.checkoutCancelUrl,
        metadata,
        paymentIntentMetadata: metadata,
        expiresAt,
      },
      attempt.providerRequestKey,
    );
    await this.saveProviderSession(attempt, leaseToken, session);
  }

  private async saveProviderSession(
    attempt: typeof checkoutAttempts.$inferSelect,
    leaseToken: string,
    session: CheckoutSession,
  ): Promise<void> {
    await this.db
      .update(checkoutAttempts)
      .set({
        status: sql`CASE WHEN ${checkoutAttempts.status} = 'creating' THEN 'pending' ELSE ${checkoutAttempts.status} END`,
        checkoutSessionId: session.id,
        paymentIntentId: session.paymentIntentId,
        paymentUrl: session.url,
        expiresAt: session.expiresAt ?? attempt.expiresAt,
        nextRetryAt: new Date(Date.now() + 60_000),
        leaseToken: null,
        leaseExpiresAt: null,
        lastProviderError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(checkoutAttempts.id, attempt.id),
          eq(checkoutAttempts.leaseToken, leaseToken),
        ),
      );
  }

  private async reconcileProviderSession(
    attempt: typeof checkoutAttempts.$inferSelect,
    leaseToken: string,
  ): Promise<void> {
    if (!attempt.connectedAccountId || !attempt.checkoutSessionId) {
      // A cancellation before dispatch is safe only after the creator lease has
      // observed it. No provider request was sent, so there is no payment to
      // reconcile.
      if (attempt.status === 'cancelling' && !attempt.providerDispatchedAt) {
        await this.releaseUnpaidAttempt(attempt.id, 'cancelled');
      } else {
        await this.finishAttemptWork(
          attempt.id,
          leaseToken,
          new Date(Date.now() + 60_000),
        );
      }
      return;
    }
    let session = await this.gateway.retrieveCheckoutSession(
      attempt.connectedAccountId,
      attempt.checkoutSessionId,
    );
    if (session.paymentStatus === 'paid') {
      if (!session.paymentIntentId) {
        await this.markAttemptForReview(
          attempt.id,
          leaseToken,
          'Paid Checkout Session has no PaymentIntent.',
        );
        return;
      }
      const intent = await this.gateway.retrievePaymentIntent(
        attempt.connectedAccountId,
        session.paymentIntentId,
      );
      if (
        session.metadata.attemptId !== attempt.id ||
        session.metadata.storeId !== attempt.storeId ||
        intent.id !== session.paymentIntentId ||
        intent.status !== 'succeeded' ||
        intent.amount !== attempt.snapshot.total ||
        intent.currency !== attempt.snapshot.currency ||
        intent.metadata.attemptId !== attempt.id ||
        intent.metadata.storeId !== attempt.storeId
      ) {
        await this.markAttemptForReview(
          attempt.id,
          leaseToken,
          'Stripe payment state does not match the frozen checkout snapshot.',
        );
        return;
      }
      await this.placePaidOnlineOrder(
        attempt.id,
        session.paymentIntentId,
        intent.chargeId,
      );
      return;
    }
    if (attempt.status === 'cancelling' && session.status === 'open') {
      session = await this.gateway.expireCheckoutSession(
        attempt.connectedAccountId,
        attempt.checkoutSessionId,
      );
    }
    if (session.status === 'expired' && session.paymentStatus !== 'paid') {
      await this.releaseUnpaidAttempt(
        attempt.id,
        attempt.status === 'cancelling' ? 'cancelled' : 'expired',
      );
      return;
    }
    // A completed-but-unpaid session is not a payment confirmation and is not
    // safe to release. Keep polling it without consuming a failure retry.
    await this.finishAttemptWork(
      attempt.id,
      leaseToken,
      new Date(Date.now() + 60_000),
    );
  }

  private async placePaidOnlineOrder(
    attemptId: string,
    paymentIntentId: string,
    paymentChargeId: string | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(checkoutAttempts)
        .where(eq(checkoutAttempts.id, attemptId))
        .for('update');
      if (!attempt) return;
      const [existing] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.attemptId, attemptId));
      if (existing) {
        await tx
          .update(checkoutAttempts)
          .set({
            status: 'succeeded',
            paymentIntentId,
            paymentChargeId,
            paymentUrl: null,
            leaseToken: null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(eq(checkoutAttempts.id, attemptId));
        return;
      }
      if (['cancelled', 'expired', 'failed'].includes(attempt.status)) {
        await tx
          .update(checkoutAttempts)
          .set({
            paymentReviewRequired: true,
            leaseToken: null,
            leaseExpiresAt: null,
            lastProviderError:
              'Provider reported a payment after local release.',
            updatedAt: new Date(),
          })
          .where(eq(checkoutAttempts.id, attemptId));
        return;
      }
      const [order] = await tx
        .insert(orders)
        .values({
          attemptId: attempt.id,
          storeId: attempt.storeId,
          userId: attempt.userId,
          status: 'placed',
          paymentMethod: 'online',
          paymentStatus: 'paid',
          version: 1,
          currency: attempt.snapshot.currency,
          subtotal: attempt.snapshot.subtotal,
          shippingFee: attempt.snapshot.shippingFee,
          total: attempt.snapshot.total,
          accountEmail: attempt.snapshot.accountContact.email,
          accountPhone: attempt.snapshot.accountContact.phoneNumber,
          shippingAddress: attempt.snapshot.shippingAddress,
          shippingPolicy: attempt.snapshot.shippingPolicy,
        })
        .returning();
      if (!order) throw new Error('Paid Order was not persisted.');
      await tx.insert(orderItems).values(
        attempt.snapshot.items.map((item) => ({
          orderId: order.id,
          storeId: attempt.storeId,
          productId: item.productId,
          variantId: item.variantId,
          name: item.name,
          variantTitle: item.variantTitle,
          sku: item.sku,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
          inventoryPolicy: item.inventoryPolicy as InventoryPolicy,
        })),
      );
      await tx
        .update(checkoutReservations)
        .set({
          orderId: order.id,
          disposition: 'consumed',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(checkoutReservations.attemptId, attempt.id),
            eq(checkoutReservations.disposition, 'held'),
          ),
        );
      await tx.insert(orderEvents).values({
        orderId: order.id,
        storeId: attempt.storeId,
        version: 1,
        kind: 'placed',
        previousStatus: null,
        nextStatus: 'placed',
        actorAuthority: 'provider',
        actorUserId: null,
      });
      await tx.insert(outboxEvents).values({
        eventType: OutboxEventType.ORDER_EMAIL_INTENT,
        aggregateId: order.id,
        deduplicationKey: `${order.id}:placed:1`,
        payload: {
          type: 'placed',
          orderId: order.id,
          version: 1,
          to: attempt.snapshot.accountContact.email,
          total: attempt.snapshot.total,
          currency: attempt.snapshot.currency,
        },
      });
      await tx
        .update(checkoutAttempts)
        .set({
          status: 'succeeded',
          paymentIntentId,
          paymentChargeId,
          paymentUrl: null,
          leaseToken: null,
          leaseExpiresAt: null,
          lastProviderError: null,
          updatedAt: new Date(),
        })
        .where(eq(checkoutAttempts.id, attempt.id));
      if (attempt.cartId)
        await tx.delete(carts).where(eq(carts.id, attempt.cartId));
    });
  }

  private async finishAttemptWork(
    attemptId: string,
    leaseToken: string,
    nextRetryAt: Date,
  ): Promise<void> {
    await this.db
      .update(checkoutAttempts)
      .set({
        leaseToken: null,
        leaseExpiresAt: null,
        nextRetryAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(checkoutAttempts.id, attemptId),
          eq(checkoutAttempts.leaseToken, leaseToken),
        ),
      );
  }

  private async markAttemptForReview(
    attemptId: string,
    leaseToken: string,
    reason: string,
  ): Promise<void> {
    await this.db
      .update(checkoutAttempts)
      .set({
        paymentReviewRequired: true,
        leaseToken: null,
        leaseExpiresAt: null,
        lastProviderError: reason.slice(0, 1000),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(checkoutAttempts.id, attemptId),
          eq(checkoutAttempts.leaseToken, leaseToken),
        ),
      );
  }

  private async recordProviderFailure(
    attempt: typeof checkoutAttempts.$inferSelect,
    leaseToken: string,
    error: unknown,
  ): Promise<void> {
    const failedAttempts = attempt.providerAttempts + 1;
    const message = error instanceof Error ? error.message : String(error);
    await this.db
      .update(checkoutAttempts)
      .set({
        providerAttempts: failedAttempts,
        paymentReviewRequired: failedAttempts >= PROVIDER_MAX_ATTEMPTS,
        leaseToken: null,
        leaseExpiresAt: null,
        lastProviderError: message.slice(0, 1000),
        nextRetryAt: new Date(Date.now() + this.retryDelayMs(failedAttempts)),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(checkoutAttempts.id, attempt.id),
          eq(checkoutAttempts.leaseToken, leaseToken),
        ),
      );
  }

  private retryDelayMs(attempts: number) {
    const delays = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
    return delays[Math.min(Math.max(attempts - 1, 0), delays.length - 1)];
  }

  private async buildSnapshot(
    tx: Database,
    userId: string,
    storeId: string,
    addressId: string,
    paymentMethod: 'cash_on_delivery' | 'online',
    version: number,
    lock: boolean,
  ): Promise<CheckoutSnapshot> {
    const [cart] = await (lock
      ? tx
          .select()
          .from(carts)
          .where(and(eq(carts.userId, userId), eq(carts.storeId, storeId)))
          .for('update')
      : tx
          .select()
          .from(carts)
          .where(and(eq(carts.userId, userId), eq(carts.storeId, storeId))));
    if (!cart)
      throw new CodedHttpError(
        HttpStatus.CONFLICT,
        'CART_EMPTY',
        'The Cart is empty.',
      );
    if (cart.version !== version)
      throw new CodedHttpError(
        HttpStatus.CONFLICT,
        'STALE_VERSION',
        'The Cart changed. Read it and create a new quote.',
        { currentVersion: cart.version },
      );
    const [account] = await (lock
      ? tx.select().from(user).where(eq(user.id, userId)).for('update')
      : tx.select().from(user).where(eq(user.id, userId)));
    if (!account?.emailVerified || !account.email.trim())
      throw new CodedHttpError(
        HttpStatus.FORBIDDEN,
        'EMAIL_VERIFICATION_REQUIRED',
        'A verified email address is required for checkout.',
      );
    if (!account.phoneNumberVerified || !account.phoneNumber?.trim())
      throw new CodedHttpError(
        HttpStatus.FORBIDDEN,
        'PHONE_VERIFICATION_REQUIRED',
        'A verified account phone number is required for checkout.',
      );
    const [address] = await (lock
      ? tx
          .select()
          .from(userAddresses)
          .where(
            and(
              eq(userAddresses.id, addressId),
              eq(userAddresses.userId, userId),
            ),
          )
          .for('update')
      : tx
          .select()
          .from(userAddresses)
          .where(
            and(
              eq(userAddresses.id, addressId),
              eq(userAddresses.userId, userId),
            ),
          ));
    if (!address)
      throw new CodedHttpError(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Resource not found.',
      );
    const [settings] = await tx
      .select()
      .from(storeCheckoutSettings)
      .where(eq(storeCheckoutSettings.storeId, storeId));
    const [storeRow] = await tx
      .select()
      .from(store)
      .where(eq(store.id, storeId));
    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.storeId, storeId),
          inArray(subscriptions.status, [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.TRIALING,
          ]),
        ),
      )
      .limit(1);
    if (!storeRow || storeRow.status !== StoreStatus.ACTIVE || !subscription)
      throw new CodedHttpError(
        HttpStatus.CONFLICT,
        'STORE_NOT_SELLING',
        'This Store cannot accept new checkout Orders.',
      );
    const paymentEnabled =
      paymentMethod === 'cash_on_delivery'
        ? settings?.cashOnDeliveryEnabled
        : settings?.onlineEnabled;
    if (
      !paymentEnabled ||
      !settings.deliveryCountries.includes(address.countryCode)
    ) {
      throw new CodedHttpError(
        HttpStatus.CONFLICT,
        paymentEnabled ? 'DELIVERY_UNSUPPORTED' : 'PAYMENT_METHOD_UNAVAILABLE',
        'The selected payment method is unavailable for this address.',
      );
    }
    const rows = await tx
      .select({
        variantId: cartItems.variantId,
        quantity: cartItems.quantity,
        productId: products.id,
        name: products.name,
        variantTitle: productVariants.title,
        sku: productVariants.sku,
        unitPrice: productVariants.price,
        productStatus: products.status,
        variantStatus: productVariants.status,
        inventoryPolicy: productVariants.inventoryPolicy,
        onHand: productVariants.onHand,
        reserved: productVariants.reserved,
      })
      .from(cartItems)
      .innerJoin(
        productVariants,
        and(
          eq(productVariants.id, cartItems.variantId),
          eq(productVariants.storeId, cartItems.storeId),
        ),
      )
      .innerJoin(
        products,
        and(
          eq(products.id, productVariants.productId),
          eq(products.storeId, productVariants.storeId),
        ),
      )
      .where(eq(cartItems.cartId, cart.id))
      .orderBy(cartItems.variantId);
    if (!rows.length)
      throw new CodedHttpError(
        HttpStatus.CONFLICT,
        'CART_EMPTY',
        'The Cart is empty.',
      );
    const items = rows.map((row) => {
      if (
        row.productStatus !== ProductStatus.PUBLISHED ||
        row.variantStatus !== ProductVariantStatus.ACTIVE
      )
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'PRODUCT_UNAVAILABLE',
          'A Cart Product is no longer available.',
        );
      if (
        row.inventoryPolicy === InventoryPolicy.TRACKED &&
        (row.onHand ?? 0) - (row.reserved ?? 0) < row.quantity
      )
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'INSUFFICIENT_STOCK',
          'Insufficient stock for one or more Cart items.',
        );
      return {
        variantId: row.variantId,
        productId: row.productId,
        name: row.name,
        variantTitle: row.variantTitle,
        sku: row.sku,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        lineTotal: row.unitPrice * row.quantity,
        inventoryPolicy: row.inventoryPolicy,
      };
    });
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const total = subtotal + settings.shippingFee;
    if (!Number.isSafeInteger(total) || total < MIN_TOTAL || total > MAX_TOTAL)
      throw new CodedHttpError(
        HttpStatus.BAD_REQUEST,
        'AMOUNT_OUT_OF_RANGE',
        'Checkout total is outside the supported range.',
      );
    return {
      cartId: cart.id,
      cartVersion: cart.version,
      items,
      subtotal,
      shippingFee: settings.shippingFee,
      total,
      currency: 'usd',
      paymentMethod,
      accountContact: {
        email: account.email,
        phoneNumber: account.phoneNumber,
      },
      shippingAddress: {
        recipientName: address.recipientName,
        recipientPhone: address.recipientPhone,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        city: address.city,
        region: address.region,
        postalCode: address.postalCode,
        countryCode: address.countryCode,
      },
      shippingPolicy: settings.shippingPolicy,
    };
  }

  private async reserve(
    tx: Database,
    attemptId: string,
    storeId: string,
    snapshot: CheckoutSnapshot,
  ) {
    for (const item of snapshot.items) {
      const [variant] = await tx
        .select()
        .from(productVariants)
        .where(
          and(
            eq(productVariants.storeId, storeId),
            eq(productVariants.id, item.variantId),
          ),
        )
        .for('update');
      if (!variant)
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'PRODUCT_UNAVAILABLE',
          'A Product Variant is no longer available.',
        );
      if (item.inventoryPolicy === 'tracked') {
        if ((variant.onHand ?? 0) - (variant.reserved ?? 0) < item.quantity)
          throw new CodedHttpError(
            HttpStatus.CONFLICT,
            'INSUFFICIENT_STOCK',
            'Insufficient stock for one or more Cart items.',
          );
        await tx
          .update(productVariants)
          .set({
            reserved: (variant.reserved ?? 0) + item.quantity,
            version: variant.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(productVariants.id, variant.id));
      }
      await tx.insert(checkoutReservations).values({
        attemptId,
        storeId,
        variantId: item.variantId,
        quantity: item.quantity,
        inventoryPolicy: item.inventoryPolicy as InventoryPolicy,
        disposition: 'held',
      });
    }
  }
  private async attemptResponse(
    tx: Database,
    userId: string,
    attemptId: string,
  ): Promise<object> {
    const [attempt] = await tx
      .select()
      .from(checkoutAttempts)
      .where(
        and(
          eq(checkoutAttempts.id, attemptId),
          eq(checkoutAttempts.userId, userId),
        ),
      );
    if (!attempt)
      throw new CodedHttpError(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Resource not found.',
      );
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.attemptId, attempt.id));
    return {
      attemptId: attempt.id,
      storeId: attempt.storeId,
      paymentMethod: attempt.paymentMethod,
      status: attempt.status,
      currency: attempt.snapshot.currency,
      total: attempt.snapshot.total,
      expiresAt: attempt.expiresAt,
      paymentUrl:
        attempt.status === 'pending' &&
        !attempt.paymentReviewRequired &&
        attempt.expiresAt !== null &&
        attempt.expiresAt > new Date()
          ? attempt.paymentUrl
          : null,
      orderId: order?.id ?? null,
      paymentReviewRequired: attempt.paymentReviewRequired,
      allowedActions:
        !attempt.paymentReviewRequired &&
        ['creating', 'pending', 'cancelling'].includes(attempt.status)
          ? ['cancel']
          : [],
      order: order ? await this.orderDetail(tx, userId, order.id) : null,
    };
  }
  private async orderDetail(
    tx: Database,
    userId: string,
    orderId: string,
  ): Promise<object> {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
    if (!order)
      throw new CodedHttpError(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Resource not found.',
      );
    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    const timeline = await tx
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, order.id))
      .orderBy(orderEvents.version);
    return {
      ...this.orderSummary(order),
      accountContact: {
        email: order.accountEmail,
        phoneNumber: order.accountPhone,
      },
      shippingAddress: order.shippingAddress,
      items,
      shippingPolicy: order.shippingPolicy,
      refundedAmount: order.refundedAmount,
      version: order.version,
      paymentReviewRequired: order.paymentReviewRequired,
      allowedActions:
        !order.paymentReviewRequired &&
        order.status === 'placed' &&
        order.paymentMethod !== 'online'
          ? ['cancel']
          : [],
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      cancellationReason: order.cancellationReason,
      preparedAt: order.preparedAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      returnedAt: order.returnedAt,
      timeline,
    };
  }
  private orderSummary(order: typeof orders.$inferSelect) {
    return {
      id: order.id,
      storeId: order.storeId,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      currency: order.currency,
      total: order.total,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
  private async ownedAddressId(
    tx: Database,
    userId: string,
    address: CheckoutSnapshot['shippingAddress'],
  ) {
    const [found] = await tx
      .select({ id: userAddresses.id })
      .from(userAddresses)
      .where(
        and(
          eq(userAddresses.userId, userId),
          eq(userAddresses.recipientName, address.recipientName),
          eq(userAddresses.recipientPhone, address.recipientPhone),
          eq(userAddresses.addressLine1, address.addressLine1),
          eq(userAddresses.countryCode, address.countryCode),
        ),
      )
      .limit(1);
    return found?.id ?? '';
  }
  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private requireIdempotencyKey(
    key: string | undefined,
  ): asserts key is string {
    if (!key || !/^[\x20-\x7e]{1,128}$/.test(key)) {
      throw new CodedHttpError(
        HttpStatus.BAD_REQUEST,
        'IDEMPOTENCY_KEY_REQUIRED',
        'A printable Idempotency-Key header is required.',
      );
    }
  }
}
