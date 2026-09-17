import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { CodedHttpError } from '@/common/errors';
import {
  orders,
  orderItems,
  orderEvents,
  checkoutReservations,
  commerceCommands,
} from '@/infrastructure/database/schema/orders.schema';
import { productVariants } from '@/infrastructure/database/schema/products.schema';
import { outboxEvents } from '@/infrastructure/database/schema/outbox.schema';
import { OutboxEventType } from '@/common/enums/outbox-event-type.enum';
import { InventoryPolicy } from '@/common/enums';
import { OrganizationRole } from '@/common/enums';
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
  constructor(@Inject(DATABASE) private readonly db: Database) {}

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
      if (
        (input.next === 'cancelled' || input.next === 'returned') &&
        order.paymentMethod === 'online' &&
        order.paymentStatus === 'paid'
      )
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'REFUND_WORKFLOW_UNAVAILABLE',
          'This paid Order requires the refund workflow, which is not available yet.',
        );
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
            total: saved.total,
            currency: saved.currency,
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
      return order.status === 'placed' && order.paymentMethod !== 'online'
        ? ['cancel']
        : [];
    }
    if (actor === 'store_support') return [];
    if (order.paymentMethod === 'online' && order.paymentStatus !== 'paid')
      return [];
    const refundBlocked =
      order.paymentMethod === 'online' && order.paymentStatus === 'paid';
    if (order.status === 'placed')
      return refundBlocked ? ['prepare'] : ['prepare', 'cancel'];
    if (order.status === 'preparing')
      return refundBlocked ? ['ship'] : ['ship', 'cancel'];
    if (order.status === 'shipped')
      return refundBlocked ? ['deliver'] : ['deliver', 'return-to-store'];
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
