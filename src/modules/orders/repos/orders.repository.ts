import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { CodedHttpError } from '@/common/errors';
import {
  orders,
  orderItems,
  orderEvents,
  checkoutReservations,
  commerceCommands,
  checkoutAttempts,
  refundOperations,
} from '@/infrastructure/database/schema/orders.schema';
import { productVariants } from '@/infrastructure/database/schema/products.schema';
import { outboxEvents } from '@/infrastructure/database/schema/outbox.schema';
import { OutboxEventType } from '@/common/enums/outbox-event-type.enum';
import { InventoryPolicy } from '@/common/enums';
import { OrganizationRole } from '@/common/enums';
import { PAYMENT_GATEWAY } from '@/infrastructure/payments/payment.tokens';
import type {
  PaymentGateway,
  PaymentRefund,
} from '@/infrastructure/payments/payment-gateway.interface';
import { stripeConfig } from '@/core/config';
import type { ConfigType } from '@nestjs/config';
import type { PaymentEnvironment } from '@/infrastructure/payments/payment-environment';
import { generateUUIDv7 } from '@/common/utils';
import { compileApiQuery } from '@/common/api-query';
import * as schema from '@/infrastructure/database/schema/schema';
import type {
  CancelOrderDto,
  DeliverOrderDto,
  OrderQueryDto,
  OrderVersionDto,
  ReturnToStoreOrderDto,
  ShipOrderDto,
  StaffCancelOrderDto,
} from '../dto';
import { userOrderQuery } from '../queries/user-order.query';
import { storeOrderQuery } from '../queries/store-order.query';

type Database = NodePgDatabase<typeof schema>;
type OrderViewer = 'shopper' | 'store_staff' | 'store_support';

/** Owned shopper Order reads. Checkout writes stay in CheckoutRepository. */
@Injectable()
export class OrdersRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(stripeConfig.KEY)
    private readonly stripe: ConfigType<typeof stripeConfig>,
  ) {}

  async listForUser(userId: string, query: OrderQueryDto) {
    const compiled = compileApiQuery(userOrderQuery, query);
    const rows = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.userId, userId), compiled.where))
      .orderBy(...compiled.orderBy)
      .limit(compiled.limit + 1);
    return compiled.createPage(rows);
  }

  async findDetailForUser(userId: string, orderId: string) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
    if (!order) {
      throw new CodedHttpError(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Order not found.',
      );
    }
    const items = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    return this.detail(order, items, 'shopper');
  }

  async listForStore(storeId: string, query: OrderQueryDto) {
    const compiled = compileApiQuery(storeOrderQuery, query);
    const rows = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.storeId, storeId), compiled.where))
      .orderBy(...compiled.orderBy)
      .limit(compiled.limit + 1);
    return compiled.createPage(rows);
  }

  async findDetailForStore(
    storeId: string,
    orderId: string,
    membershipRole: OrganizationRole,
  ) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)));
    if (!order) throw this.notFound();
    const items = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    return this.detail(
      order,
      items,
      membershipRole === OrganizationRole.OWNER ||
        membershipRole === OrganizationRole.MANAGER
        ? 'store_staff'
        : 'store_support',
    );
  }

  cancelByShopper(
    userId: string,
    orderId: string,
    dto: CancelOrderDto,
    key?: string,
  ) {
    return this.transition({
      actorUserId: userId,
      authority: 'shopper',
      orderId,
      dto,
      key,
      operation: 'shopper-cancel',
      allowed: ['placed'],
      next: 'cancelled',
      reason: dto.reason,
      requireReason: false,
      inventory: 'release',
      email: 'cancelled',
      userScoped: true,
    });
  }

  prepare(
    actorUserId: string,
    storeId: string,
    orderId: string,
    dto: OrderVersionDto,
    key?: string,
  ) {
    return this.transition({
      actorUserId,
      authority: 'store_staff',
      storeId,
      orderId,
      dto,
      key,
      operation: 'prepare',
      allowed: ['placed'],
      next: 'preparing',
    });
  }

  ship(
    actorUserId: string,
    storeId: string,
    orderId: string,
    dto: ShipOrderDto,
    key?: string,
  ) {
    const carrier = dto.carrier?.trim();
    const trackingNumber = dto.trackingNumber?.trim();
    if (
      (dto.carrier !== undefined && !carrier) ||
      (dto.trackingNumber !== undefined && !trackingNumber) ||
      Boolean(carrier) !== Boolean(trackingNumber)
    )
      throw new CodedHttpError(
        HttpStatus.BAD_REQUEST,
        'TRACKING_PAIR_REQUIRED',
        'Carrier and tracking number must be supplied together.',
      );
    return this.transition({
      actorUserId,
      authority: 'store_staff',
      storeId,
      orderId,
      dto,
      key,
      operation: 'ship',
      allowed: ['preparing'],
      next: 'shipped',
      inventory: 'consume',
      carrier: carrier || null,
      trackingNumber: trackingNumber || null,
      email: 'shipped',
    });
  }

  deliver(
    actorUserId: string,
    storeId: string,
    orderId: string,
    dto: DeliverOrderDto,
    key?: string,
  ) {
    return this.transition({
      actorUserId,
      authority: 'store_staff',
      storeId,
      orderId,
      dto,
      key,
      operation: 'deliver',
      allowed: ['shipped'],
      next: 'delivered',
      email: 'delivered',
      codCashCollected: dto.cashCollected,
    });
  }

  cancelByStaff(
    actorUserId: string,
    storeId: string,
    orderId: string,
    dto: StaffCancelOrderDto,
    key?: string,
  ) {
    return this.transition({
      actorUserId,
      authority: 'store_staff',
      storeId,
      orderId,
      dto,
      key,
      operation: 'staff-cancel',
      allowed: ['placed', 'preparing'],
      next: 'cancelled',
      reason: dto.reason,
      requireReason: true,
      inventory: 'release',
      email: 'cancelled',
    });
  }

  returnToStore(
    actorUserId: string,
    storeId: string,
    orderId: string,
    dto: ReturnToStoreOrderDto,
    key?: string,
  ) {
    if (dto.itemsReceived !== true)
      throw new CodedHttpError(
        HttpStatus.BAD_REQUEST,
        'ITEMS_RECEIPT_REQUIRED',
        'Full physical receipt of all items must be confirmed.',
      );
    return this.transition({
      actorUserId,
      authority: 'store_staff',
      storeId,
      orderId,
      dto,
      key,
      operation: 'return-to-store',
      allowed: ['shipped'],
      next: 'returned',
      reason: dto.reason,
      requireReason: true,
      inventory: 'return',
    });
  }

  async retryRefund(
    actorUserId: string,
    storeId: string,
    orderId: string,
    dto: OrderVersionDto,
    key?: string,
  ) {
    if (!key || !/^[\x20-\x7E]{1,128}$/.test(key))
      throw new CodedHttpError(
        HttpStatus.BAD_REQUEST,
        'IDEMPOTENCY_KEY_REQUIRED',
        'A printable Idempotency-Key header is required.',
      );
    const input = {
      actorUserId,
      authority: 'store_staff' as const,
      storeId,
      orderId,
      dto,
      key,
      operation: 'refund-retry',
    };
    const requestHash = this.requestHash(dto);
    return this.db.transaction(async (tx) => {
      const replay = await this.replayCommand(tx, input, requestHash);
      if (replay) return replay;
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
        .for('update');
      if (!order) throw this.notFound();
      const lockedReplay = await this.replayCommand(tx, input, requestHash);
      if (lockedReplay) return lockedReplay;
      if (order.version !== dto.version)
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'STALE_VERSION',
          'The Order changed. Read the latest version and retry.',
          { currentVersion: order.version },
        );
      if (order.paymentReviewRequired) throw this.paymentReviewRequired();
      if (
        order.paymentMethod !== 'online' ||
        order.paymentStatus !== 'refund_failed'
      )
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'REFUND_NOT_RETRYABLE',
          'Only a genuinely failed online refund can be retried.',
        );
      const [previous] = await tx
        .select()
        .from(refundOperations)
        .where(eq(refundOperations.orderId, order.id))
        .orderBy(sql`${refundOperations.generation} DESC`)
        .limit(1)
        .for('update');
      if (!previous || previous.status !== 'failed')
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'REFUND_NOT_RETRYABLE',
          'The previous refund has not reached a retryable failure.',
        );
      const [next] = await tx
        .update(orders)
        .set({
          paymentStatus: 'refund_pending',
          version: order.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
        .returning();
      if (!next) throw new Error('Refund retry Order update failed.');
      const [operation] = await tx
        .insert(refundOperations)
        .values({
          orderId: order.id,
          generation: previous.generation + 1,
          environment: previous.environment,
          connectedAccountId: previous.connectedAccountId,
          paymentIntentId: previous.paymentIntentId,
          chargeId: previous.chargeId,
          amount: order.total,
          currency: order.currency,
          providerRequestKey: `refund:${order.id}:${previous.generation + 1}`,
        })
        .returning();
      if (!operation) throw new Error('Refund retry was not persisted.');
      await this.insertPaymentEvent(tx, next, 'refund_retry_queued', null);
      await this.insertRefundOutbox(tx, operation.id);
      await tx.insert(commerceCommands).values({
        actorUserId,
        operation: input.operation,
        resourceId: order.id,
        idempotencyKey: key,
        requestHash,
        orderId: order.id,
      });
      return this.detailInTransaction(tx, next, 'store_staff');
    });
  }

  /** Called by the financial outbox, periodic sweep and Connect receipts. */
  async recoverDueRefunds(): Promise<void> {
    const due = await this.db
      .select({ id: refundOperations.id })
      .from(refundOperations)
      .where(
        and(
          eq(refundOperations.status, 'pending'),
          lte(refundOperations.nextRetryAt, new Date()),
        ),
      )
      .limit(100);
    await Promise.all(due.map((operation) => this.processRefund(operation.id)));
  }

  async processRefund(operationId: string): Promise<void> {
    const now = new Date();
    const leaseToken = generateUUIDv7();
    const [operation] = await this.db
      .update(refundOperations)
      .set({
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + 5 * 60_000),
        updatedAt: now,
      })
      .where(
        and(
          eq(refundOperations.id, operationId),
          eq(refundOperations.status, 'pending'),
          or(
            isNull(refundOperations.leaseToken),
            lte(refundOperations.leaseExpiresAt, now),
          ),
        ),
      )
      .returning();
    if (!operation) return;
    try {
      if (operation.providerRefundId) {
        await this.applyProviderRefund(
          operation,
          leaseToken,
          await this.gateway.retrieveRefund(
            operation.connectedAccountId,
            operation.providerRefundId,
          ),
        );
        return;
      }
      const chargeState = await this.reconcileRefundedCharge(operation.orderId);
      if (chargeState !== 'not_refunded') {
        await this.db
          .update(refundOperations)
          .set({
            status:
              chargeState === 'fully_refunded'
                ? 'succeeded'
                : 'review_required',
            leaseToken: null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(refundOperations.id, operation.id),
              eq(refundOperations.leaseToken, leaseToken),
            ),
          );
        return;
      }
      if (
        operation.providerDispatchedAt &&
        Date.now() - operation.providerDispatchedAt.getTime() > 23 * 60 * 60_000
      ) {
        await this.markRefundForReview(
          operation.id,
          leaseToken,
          'Refund creation exceeded the provider idempotency safety window.',
        );
        return;
      }
      // Stripe's idempotency key makes this safe even if a prior response was
      // lost. The amount comes from the immutable Order, never the caller.
      await this.db
        .update(refundOperations)
        .set({
          providerDispatchedAt: operation.providerDispatchedAt ?? new Date(),
          providerAttempts: operation.providerAttempts + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(refundOperations.id, operation.id),
            eq(refundOperations.leaseToken, leaseToken),
          ),
        );
      const refund = await this.gateway.createRefund(
        operation.connectedAccountId,
        {
          paymentIntentId: operation.paymentIntentId ?? undefined,
          chargeId: operation.chargeId ?? undefined,
          amount: operation.amount,
          metadata: {
            orderId: operation.orderId,
            refundOperationId: operation.id,
          },
        },
        operation.providerRequestKey,
      );
      await this.applyProviderRefund(operation, leaseToken, refund);
    } catch (error) {
      await this.recordRefundFailure(operation, leaseToken, error);
    }
  }

  /** Operator-only read of a durable refund operation and its Order state. */
  async inspectRefundForOperator(operationId: string) {
    const [operation] = await this.db
      .select()
      .from(refundOperations)
      .where(eq(refundOperations.id, operationId));
    if (!operation) return null;
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, operation.orderId));
    return { operation, order: order ?? null };
  }

  /** Reuses the leased refund handler and never changes its retry budget. */
  async replayRefundForOperator(operationId: string) {
    const existing = await this.inspectRefundForOperator(operationId);
    if (!existing) return null;
    await this.processRefund(operationId);
    return this.inspectRefundForOperator(operationId);
  }

  /** Connect events are hints only; provider retrieval remains authoritative. */
  async processPurchaseEvent(input: {
    accountId: string;
    environment: PaymentEnvironment;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<boolean> {
    const expected = this.stripe.connectSandboxMode ? 'sandbox' : 'live';
    if (input.environment !== expected) return false;
    const object = (
      input.payload.data as { object?: Record<string, unknown> } | undefined
    )?.object;
    const refundId =
      typeof object?.id === 'string' && input.eventType.startsWith('refund.')
        ? object.id
        : undefined;
    if (refundId) {
      const [operation] = await this.db
        .select({ id: refundOperations.id })
        .from(refundOperations)
        .where(
          and(
            eq(refundOperations.environment, input.environment),
            eq(refundOperations.connectedAccountId, input.accountId),
            eq(refundOperations.providerRefundId, refundId),
          ),
        )
        .limit(1);
      if (operation) {
        await this.processRefund(operation.id);
        return true;
      }
    }
    const paymentIntentId =
      typeof object?.payment_intent === 'string'
        ? object.payment_intent
        : input.eventType.startsWith('payment_intent.') &&
            typeof object?.id === 'string'
          ? object.id
          : undefined;
    const chargeId =
      typeof object?.charge === 'string'
        ? object.charge
        : input.eventType.startsWith('charge.') &&
            typeof object?.id === 'string'
          ? object.id
          : undefined;
    const [row] = await this.db
      .select({ id: orders.id })
      .from(orders)
      .innerJoin(checkoutAttempts, eq(orders.attemptId, checkoutAttempts.id))
      .where(
        and(
          eq(checkoutAttempts.paymentEnvironment, input.environment),
          eq(checkoutAttempts.connectedAccountId, input.accountId),
          or(
            paymentIntentId
              ? eq(checkoutAttempts.paymentIntentId, paymentIntentId)
              : sql`false`,
            chargeId
              ? eq(checkoutAttempts.paymentChargeId, chargeId)
              : sql`false`,
          ),
        ),
      )
      .limit(1);
    if (!row) return false;
    if (input.eventType.startsWith('charge.dispute.')) {
      await this.markOrderReview(row.id, 'Stripe reported a payment dispute.');
      return true;
    }
    if (
      input.eventType.startsWith('refund.') ||
      input.eventType === 'charge.refunded'
    ) {
      // An unknown external refund must never trigger a new local refund; the
      // original charge is retrieved to distinguish full from partial truth.
      await this.reconcileRefundedCharge(row.id);
      return true;
    }
    return false;
  }

  private async applyProviderRefund(
    operation: typeof refundOperations.$inferSelect,
    leaseToken: string,
    refund: PaymentRefund,
  ) {
    if (
      refund.amount !== operation.amount ||
      refund.currency !== operation.currency
    ) {
      await this.markRefundForReview(
        operation.id,
        leaseToken,
        'Stripe refund amount or currency does not match the original Order.',
      );
      return;
    }
    if (refund.status === 'succeeded') {
      await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(refundOperations)
          .where(eq(refundOperations.id, operation.id))
          .for('update');
        if (!current || current.leaseToken !== leaseToken) return;
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, current.orderId))
          .for('update');
        if (!order) return;
        const [saved] = await tx
          .update(orders)
          .set({
            paymentStatus: 'refunded',
            refundedAmount: current.amount,
            version: order.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))
          .returning();
        if (!saved) return;
        await tx
          .update(refundOperations)
          .set({
            status: 'succeeded',
            providerRefundId: refund.id,
            leaseToken: null,
            leaseExpiresAt: null,
            lastProviderError: null,
            updatedAt: new Date(),
          })
          .where(eq(refundOperations.id, current.id));
        await this.insertPaymentEvent(tx, saved, 'refunded', null);
        await tx.insert(outboxEvents).values({
          eventType: OutboxEventType.ORDER_EMAIL_INTENT,
          aggregateId: saved.id,
          deduplicationKey: `${saved.id}:refunded:${saved.version}`,
          payload: {
            type: 'refunded',
            orderId: saved.id,
            version: saved.version,
            to: saved.accountEmail,
            recipientName: saved.shippingAddress.recipientName,
            total: saved.total,
            currency: saved.currency,
            reason: saved.cancellationReason,
          },
        });
      });
      return;
    }
    if (refund.status === 'failed' || refund.status === 'canceled') {
      await this.markRefundFailed(
        operation.id,
        leaseToken,
        refund.id,
        'Stripe rejected the refund.',
      );
      return;
    }
    await this.db
      .update(refundOperations)
      .set({
        providerRefundId: refund.id,
        leaseToken: null,
        leaseExpiresAt: null,
        nextRetryAt: new Date(Date.now() + 60_000),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(refundOperations.id, operation.id),
          eq(refundOperations.leaseToken, leaseToken),
        ),
      );
  }

  private async markRefundFailed(
    id: string,
    leaseToken: string,
    refundId: string | null,
    reason: string,
  ) {
    await this.db.transaction(async (tx) => {
      const [operation] = await tx
        .select()
        .from(refundOperations)
        .where(eq(refundOperations.id, id))
        .for('update');
      if (!operation || operation.leaseToken !== leaseToken) return;
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, operation.orderId))
        .for('update');
      if (!order) return;
      const [saved] = await tx
        .update(orders)
        .set({
          paymentStatus: 'refund_failed',
          version: order.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
        .returning();
      if (!saved) return;
      await tx
        .update(refundOperations)
        .set({
          status: 'failed',
          providerRefundId: refundId,
          leaseToken: null,
          leaseExpiresAt: null,
          lastProviderError: reason,
          updatedAt: new Date(),
        })
        .where(eq(refundOperations.id, id));
      await this.insertPaymentEvent(tx, saved, 'refund_failed', reason);
    });
  }

  private async markRefundForReview(
    id: string,
    leaseToken: string,
    reason: string,
  ) {
    const [operation] = await this.db
      .select()
      .from(refundOperations)
      .where(eq(refundOperations.id, id))
      .limit(1);
    if (!operation) return;
    await this.db
      .update(refundOperations)
      .set({
        status: 'review_required',
        leaseToken: null,
        leaseExpiresAt: null,
        lastProviderError: reason.slice(0, 1000),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(refundOperations.id, id),
          eq(refundOperations.leaseToken, leaseToken),
        ),
      );
    await this.markOrderReview(operation.orderId, reason);
  }

  private async recordRefundFailure(
    operation: typeof refundOperations.$inferSelect,
    leaseToken: string,
    error: unknown,
  ) {
    const attempts = operation.providerAttempts + 1;
    const message = error instanceof Error ? error.message : String(error);
    if (attempts >= 10) {
      await this.markRefundForReview(operation.id, leaseToken, message);
      return;
    }
    await this.db
      .update(refundOperations)
      .set({
        providerAttempts: attempts,
        leaseToken: null,
        leaseExpiresAt: null,
        lastProviderError: message.slice(0, 1000),
        nextRetryAt: new Date(Date.now() + this.refundRetryDelay(attempts)),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(refundOperations.id, operation.id),
          eq(refundOperations.leaseToken, leaseToken),
        ),
      );
  }

  private async markOrderReview(orderId: string, reason: string) {
    await this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update');
      if (!order || order.paymentReviewRequired) return;
      const [saved] = await tx
        .update(orders)
        .set({
          paymentReviewRequired: true,
          version: order.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
        .returning();
      if (saved)
        await this.insertPaymentEvent(
          tx,
          saved,
          'payment_review_required',
          reason,
        );
    });
  }

  /** Returns payment truth from the original direct charge. This deliberately
   * does not rely on webhook metadata, which external refunds do not carry. */
  private async reconcileRefundedCharge(
    orderId: string,
  ): Promise<'not_refunded' | 'fully_refunded' | 'partial_or_mismatched'> {
    const [row] = await this.db
      .select({
        order: orders,
        accountId: checkoutAttempts.connectedAccountId,
        paymentIntentId: checkoutAttempts.paymentIntentId,
      })
      .from(orders)
      .innerJoin(checkoutAttempts, eq(orders.attemptId, checkoutAttempts.id))
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!row?.accountId || !row.paymentIntentId) {
      await this.markOrderReview(
        orderId,
        'Original payment references are unavailable.',
      );
      return 'partial_or_mismatched';
    }
    const intent = await this.gateway.retrievePaymentIntent(
      row.accountId,
      row.paymentIntentId,
    );
    if (
      !intent.chargeId ||
      intent.amount !== row.order.total ||
      intent.currency !== row.order.currency
    ) {
      await this.markOrderReview(
        orderId,
        'Original Stripe payment does not match the Order.',
      );
      return 'partial_or_mismatched';
    }
    const charge = await this.gateway.retrieveCharge(
      row.accountId,
      intent.chargeId,
    );
    if (
      charge.amount !== row.order.total ||
      charge.currency !== row.order.currency
    ) {
      await this.markOrderReview(
        orderId,
        'Original Stripe charge does not match the Order.',
      );
      return 'partial_or_mismatched';
    }
    if (charge.refundedAmount === 0) return 'not_refunded';
    if (charge.refundedAmount !== row.order.total) {
      await this.applyExternalPaymentTruth(
        orderId,
        charge.refundedAmount,
        true,
        'Stripe reported a partial external refund.',
      );
      return 'partial_or_mismatched';
    }
    await this.applyExternalPaymentTruth(
      orderId,
      charge.refundedAmount,
      row.order.status !== 'cancelled' && row.order.status !== 'returned',
      'Stripe confirmed a full external refund.',
    );
    return 'fully_refunded';
  }

  private async applyExternalPaymentTruth(
    orderId: string,
    refundedAmount: number,
    review: boolean,
    reason: string,
  ) {
    await this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update');
      if (!order) return;
      const fullyRefunded = refundedAmount === order.total;
      const unchanged =
        order.refundedAmount === refundedAmount &&
        order.paymentReviewRequired === review &&
        (!fullyRefunded || order.paymentStatus === 'refunded');
      if (unchanged) return;
      const [saved] = await tx
        .update(orders)
        .set({
          refundedAmount,
          ...(fullyRefunded ? { paymentStatus: 'refunded' as const } : {}),
          paymentReviewRequired: review,
          version: order.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
        .returning();
      if (!saved) return;
      await this.insertPaymentEvent(
        tx,
        saved,
        fullyRefunded ? 'refunded_external' : 'payment_review_required',
        reason,
      );
      if (fullyRefunded)
        await tx.insert(outboxEvents).values({
          eventType: OutboxEventType.ORDER_EMAIL_INTENT,
          aggregateId: saved.id,
          deduplicationKey: `${saved.id}:refunded:${saved.version}`,
          payload: {
            type: 'refunded',
            orderId: saved.id,
            version: saved.version,
            to: saved.accountEmail,
            recipientName: saved.shippingAddress.recipientName,
            total: saved.total,
            currency: saved.currency,
            reason: saved.cancellationReason,
          },
        });
    });
  }

  private async insertPaymentEvent(
    tx: Database,
    order: typeof orders.$inferSelect,
    kind: string,
    reason: string | null,
  ) {
    await tx.insert(orderEvents).values({
      orderId: order.id,
      storeId: order.storeId,
      version: order.version,
      kind,
      previousStatus: order.status,
      nextStatus: order.status,
      actorAuthority: 'provider',
      actorUserId: null,
      reason,
    });
  }

  private async insertRefundOutbox(tx: Database, refundOperationId: string) {
    await tx.insert(outboxEvents).values({
      eventType: OutboxEventType.ORDER_REFUND_REQUESTED,
      aggregateId: refundOperationId,
      deduplicationKey: `refund:${refundOperationId}`,
      payload: { refundOperationId },
    });
  }

  private refundRetryDelay(attempts: number) {
    return [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000][
      Math.min(attempts - 1, 3)
    ];
  }

  private paymentReviewRequired() {
    return new CodedHttpError(
      HttpStatus.CONFLICT,
      'PAYMENT_REVIEW_REQUIRED',
      'This Order requires payment review before fulfillment can continue.',
    );
  }

  private summary(order: typeof orders.$inferSelect) {
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

  private async detail(
    order: typeof orders.$inferSelect,
    items: (typeof orderItems.$inferSelect)[],
    actor: OrderViewer,
  ) {
    const timeline = await this.db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, order.id))
      .orderBy(asc(orderEvents.version));
    return {
      ...this.summary(order),
      version: order.version,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      refundedAmount: order.refundedAmount,
      paymentReviewRequired: order.paymentReviewRequired,
      allowedActions: this.allowedActions(order, actor),
      accountContact: {
        email: order.accountEmail,
        phoneNumber: order.accountPhone,
      },
      shippingAddress: order.shippingAddress,
      shippingPolicy: order.shippingPolicy,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      cancellationReason: order.cancellationReason,
      preparedAt: order.preparedAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      returnedAt: order.returnedAt,
      items,
      timeline,
    };
  }

  private async transition(input: {
    actorUserId: string;
    authority: 'shopper' | 'store_staff';
    storeId?: string;
    orderId: string;
    dto: { version: number };
    key?: string;
    operation: string;
    allowed: Array<'placed' | 'preparing' | 'shipped'>;
    next: 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
    reason?: string;
    requireReason?: boolean;
    inventory?: 'release' | 'consume' | 'return';
    carrier?: string | null;
    trackingNumber?: string | null;
    email?: 'shipped' | 'delivered' | 'cancelled';
    codCashCollected?: boolean;
    userScoped?: boolean;
  }) {
    if (!input.key || !/^[\x20-\x7E]{1,128}$/.test(input.key))
      throw new CodedHttpError(
        HttpStatus.BAD_REQUEST,
        'IDEMPOTENCY_KEY_REQUIRED',
        'A printable Idempotency-Key header is required.',
      );
    const reason = input.reason?.trim();
    if (input.reason !== undefined && !reason)
      throw new CodedHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_REASON',
        'Reason must contain non-whitespace text.',
      );
    if (input.requireReason && !reason)
      throw new CodedHttpError(
        HttpStatus.BAD_REQUEST,
        'REASON_REQUIRED',
        'A reason is required.',
      );
    if (reason && reason.length > 500)
      throw new CodedHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_REASON',
        'Reason must be 1–500 characters.',
      );
    const requestHash = this.requestHash(input.dto);
    return this.db.transaction(async (tx) => {
      const existingReplay = await this.replayCommand(tx, input, requestHash);
      if (existingReplay) return existingReplay;
      const where = [
        eq(orders.id, input.orderId),
        ...(input.storeId ? [eq(orders.storeId, input.storeId)] : []),
        ...(input.userScoped ? [eq(orders.userId, input.actorUserId)] : []),
      ];
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(...where))
        .for('update');
      if (!order) throw this.notFound();
      // A concurrent request can create its command while this transaction
      // waits for the Order lock. Re-check before stale-version validation.
      const lockedReplay = await this.replayCommand(tx, input, requestHash);
      if (lockedReplay) return lockedReplay;
      if (order.version !== input.dto.version)
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'STALE_VERSION',
          'The Order changed. Read the latest version and retry.',
          { currentVersion: order.version },
        );
      if (
        !input.allowed.includes(
          order.status as 'placed' | 'preparing' | 'shipped',
        )
      )
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'INVALID_ORDER_TRANSITION',
          'This Order cannot perform that action in its current state.',
        );
      if (order.paymentReviewRequired)
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'PAYMENT_REVIEW_REQUIRED',
          'This Order requires payment review before fulfillment can continue.',
        );
      if (order.paymentMethod === 'online' && order.paymentStatus !== 'paid')
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'PAYMENT_NOT_CONFIRMED',
          'Online payment must be confirmed before this action.',
        );
      const requiresRefund =
        (input.next === 'cancelled' || input.next === 'returned') &&
        order.paymentMethod === 'online' &&
        order.paymentStatus === 'paid';
      let refundSource:
        | Pick<
            typeof checkoutAttempts.$inferSelect,
            'connectedAccountId' | 'paymentEnvironment' | 'paymentIntentId'
          >
        | undefined;
      if (requiresRefund) {
        const [attempt] = await tx
          .select({
            connectedAccountId: checkoutAttempts.connectedAccountId,
            paymentEnvironment: checkoutAttempts.paymentEnvironment,
            paymentIntentId: checkoutAttempts.paymentIntentId,
          })
          .from(checkoutAttempts)
          .where(eq(checkoutAttempts.id, order.attemptId))
          .for('update');
        if (
          !attempt?.connectedAccountId ||
          !attempt.paymentEnvironment ||
          !attempt.paymentIntentId
        )
          throw new CodedHttpError(
            HttpStatus.CONFLICT,
            'PAYMENT_REVIEW_REQUIRED',
            'The original payment reference requires review before refunding.',
          );
        refundSource = attempt;
      }
      if (
        input.next === 'delivered' &&
        order.paymentMethod === 'cash_on_delivery' &&
        input.codCashCollected !== true
      )
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'CASH_COLLECTION_REQUIRED',
          'Cash collection must be explicitly confirmed before delivery.',
        );
      if (
        input.next === 'delivered' &&
        order.paymentMethod === 'online' &&
        input.codCashCollected !== undefined
      )
        throw new CodedHttpError(
          HttpStatus.BAD_REQUEST,
          'CASH_COLLECTION_NOT_APPLICABLE',
          'cashCollected must be omitted for online Orders.',
        );
      if (input.inventory === 'release')
        await this.applyReservations(tx, order.id, 'held', 'released', -1);
      if (input.inventory === 'consume')
        await this.applyReservations(tx, order.id, 'held', 'consumed', -1);
      if (input.inventory === 'return')
        await this.applyReservations(tx, order.id, 'consumed', 'returned', 1);
      const next = input.next;
      const now = new Date();
      const [saved] = await tx
        .update(orders)
        .set({
          status: next,
          ...(requiresRefund
            ? { paymentStatus: 'refund_pending' as const }
            : {}),
          version: order.version + 1,
          updatedAt: now,
          ...(next === 'delivered' && order.paymentMethod === 'cash_on_delivery'
            ? { paymentStatus: 'paid' as const }
            : {}),
          ...(input.carrier !== undefined
            ? { carrier: input.carrier, trackingNumber: input.trackingNumber }
            : {}),
          ...(next === 'cancelled' || next === 'returned'
            ? { cancellationReason: reason ?? null }
            : {}),
          ...(next === 'preparing' ? { preparedAt: now } : {}),
          ...(next === 'shipped' ? { shippedAt: now } : {}),
          ...(next === 'delivered' ? { deliveredAt: now } : {}),
          ...(next === 'cancelled' ? { cancelledAt: now } : {}),
          ...(next === 'returned' ? { returnedAt: now } : {}),
        })
        .where(and(eq(orders.id, order.id), eq(orders.version, order.version)))
        .returning();
      if (!saved)
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'STALE_VERSION',
          'The Order changed concurrently.',
        );
      await tx.insert(orderEvents).values({
        orderId: saved.id,
        storeId: saved.storeId,
        version: saved.version,
        kind: next,
        previousStatus: order.status,
        nextStatus: next,
        actorAuthority: input.authority,
        actorUserId: input.actorUserId,
        reason: reason ?? null,
      });
      if (refundSource) {
        const [refund] = await tx
          .insert(refundOperations)
          .values({
            orderId: saved.id,
            generation: 1,
            environment: refundSource.paymentEnvironment as PaymentEnvironment,
            connectedAccountId: refundSource.connectedAccountId as string,
            paymentIntentId: refundSource.paymentIntentId as string,
            amount: saved.total,
            currency: saved.currency,
            providerRequestKey: `refund:${saved.id}:1`,
          })
          .returning();
        if (!refund) throw new Error('Refund operation was not persisted.');
        await this.insertRefundOutbox(tx, refund.id);
      }
      if (input.email)
        await tx.insert(outboxEvents).values({
          eventType: OutboxEventType.ORDER_EMAIL_INTENT,
          aggregateId: saved.id,
          deduplicationKey: `${saved.id}:${input.email}:${saved.version}`,
          payload: {
            type: input.email,
            orderId: saved.id,
            version: saved.version,
            to: saved.accountEmail,
            recipientName: saved.shippingAddress.recipientName,
            total: saved.total,
            currency: saved.currency,
            reason: saved.cancellationReason,
          },
        });
      await tx.insert(commerceCommands).values({
        actorUserId: input.actorUserId,
        operation: input.operation,
        resourceId: input.orderId,
        idempotencyKey: input.key!,
        requestHash,
        orderId: saved.id,
      });
      return this.detailInTransaction(tx, saved, input.authority);
    });
  }

  private async applyReservations(
    tx: Database,
    orderId: string,
    from: 'held' | 'consumed',
    to: 'released' | 'consumed' | 'returned',
    onHandDelta: -1 | 1,
  ) {
    const rows = await tx
      .select()
      .from(checkoutReservations)
      .where(
        and(
          eq(checkoutReservations.orderId, orderId),
          eq(checkoutReservations.disposition, from),
        ),
      )
      .orderBy(asc(checkoutReservations.variantId))
      .for('update');
    for (const row of rows) {
      if (row.inventoryPolicy === InventoryPolicy.TRACKED) {
        const [variant] = await tx
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, row.variantId))
          .for('update');
        if (!variant || variant.inventoryPolicy !== InventoryPolicy.TRACKED)
          throw new CodedHttpError(
            HttpStatus.CONFLICT,
            'INVENTORY_STATE_CONFLICT',
            'The captured inventory policy cannot be safely applied.',
          );
        const onHand = variant.onHand ?? 0;
        const reserved = variant.reserved ?? 0;
        if (
          onHandDelta === -1 &&
          (reserved < row.quantity ||
            (to === 'consumed' && onHand < row.quantity))
        )
          throw new CodedHttpError(
            HttpStatus.CONFLICT,
            'INVENTORY_STATE_CONFLICT',
            'Reserved stock is no longer available.',
          );
        if (onHandDelta === 1 && onHand > 2147483647 - row.quantity)
          throw new CodedHttpError(
            HttpStatus.CONFLICT,
            'INVENTORY_OVERFLOW',
            'Returned stock exceeds the supported inventory range.',
          );
        await tx
          .update(productVariants)
          .set({
            onHand:
              to === 'consumed'
                ? onHand - row.quantity
                : to === 'returned'
                  ? onHand + row.quantity
                  : onHand,
            reserved: from === 'held' ? reserved - row.quantity : reserved,
            version: variant.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(productVariants.id, variant.id));
      }
      await tx
        .update(checkoutReservations)
        .set({ disposition: to, updatedAt: new Date() })
        .where(eq(checkoutReservations.id, row.id));
    }
  }

  private async detailInTransaction(
    tx: Database,
    order: typeof orders.$inferSelect,
    actor: OrderViewer,
  ) {
    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    const timeline = await tx
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, order.id))
      .orderBy(asc(orderEvents.version));
    return {
      ...this.summary(order),
      version: order.version,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      refundedAmount: order.refundedAmount,
      paymentReviewRequired: order.paymentReviewRequired,
      allowedActions: this.allowedActions(order, actor),
      accountContact: {
        email: order.accountEmail,
        phoneNumber: order.accountPhone,
      },
      shippingAddress: order.shippingAddress,
      shippingPolicy: order.shippingPolicy,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      cancellationReason: order.cancellationReason,
      preparedAt: order.preparedAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      returnedAt: order.returnedAt,
      items,
      timeline,
    };
  }

  private async replayCommand(
    tx: Database,
    input: {
      actorUserId: string;
      operation: string;
      orderId: string;
      key?: string;
      storeId?: string;
      userScoped?: boolean;
      authority: 'shopper' | 'store_staff';
    },
    requestHash: string,
  ) {
    const [command] = await tx
      .select()
      .from(commerceCommands)
      .where(
        and(
          eq(commerceCommands.actorUserId, input.actorUserId),
          eq(commerceCommands.operation, input.operation),
          eq(commerceCommands.resourceId, input.orderId),
          eq(commerceCommands.idempotencyKey, input.key!),
        ),
      )
      .for('update');
    if (!command) return null;
    if (command.requestHash !== requestHash)
      throw new CodedHttpError(
        HttpStatus.CONFLICT,
        'IDEMPOTENCY_CONFLICT',
        'This Idempotency-Key was already used with a different request.',
      );
    const [replay] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, command.orderId!));
    if (
      !replay ||
      (input.storeId && replay.storeId !== input.storeId) ||
      (input.userScoped && replay.userId !== input.actorUserId)
    )
      throw this.notFound();
    return this.detailInTransaction(tx, replay, input.authority);
  }

  private allowedActions(
    order: typeof orders.$inferSelect,
    actor: OrderViewer,
  ) {
    if (order.paymentReviewRequired) return [];
    if (actor === 'shopper') {
      return order.status === 'placed' &&
        (order.paymentMethod === 'cash_on_delivery' ||
          order.paymentStatus === 'paid')
        ? ['cancel']
        : [];
    }
    if (actor === 'store_support') return [];
    if (order.paymentMethod === 'online' && order.paymentStatus !== 'paid')
      return [];
    if (order.status === 'placed') return ['prepare', 'cancel'];
    if (order.status === 'preparing') return ['ship', 'cancel'];
    if (order.status === 'shipped') return ['deliver', 'return-to-store'];
    return [];
  }

  private requestHash(dto: object) {
    return createHash('sha256')
      .update(JSON.stringify(this.canonicalize(dto)))
      .digest('hex');
  }

  private canonicalize(value: unknown): unknown {
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value))
      return value.map((item) => this.canonicalize(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, this.canonicalize(nested)]),
    );
  }

  private notFound() {
    return new CodedHttpError(
      HttpStatus.NOT_FOUND,
      'RESOURCE_NOT_FOUND',
      'Order not found.',
    );
  }
}
