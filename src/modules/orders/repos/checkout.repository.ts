import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
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

type Database = NodePgDatabase<typeof schema>;
const QUOTE_MS = 5 * 60 * 1000;
const MAX_TOTAL = 99_999_999;
const MIN_TOTAL = 50;

@Injectable()
export class CheckoutRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async quote(userId: string, storeId: string, dto: CreateCheckoutQuoteDto) {
    if (dto.paymentMethod === 'online')
      throw new CodedHttpError(
        HttpStatus.CONFLICT,
        'PAYMENT_METHOD_UNAVAILABLE',
        'Online payment is not available until checkout payment setup is complete.',
      );
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
      if (quote.snapshot.paymentMethod === 'online')
        throw new CodedHttpError(
          HttpStatus.CONFLICT,
          'PAYMENT_METHOD_UNAVAILABLE',
          'Online payment is not available until checkout payment setup is complete.',
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
    if (
      !settings?.cashOnDeliveryEnabled ||
      !settings.deliveryCountries.includes(address.countryCode)
    ) {
      throw new CodedHttpError(
        HttpStatus.CONFLICT,
        settings?.cashOnDeliveryEnabled
          ? 'DELIVERY_UNSUPPORTED'
          : 'PAYMENT_METHOD_UNAVAILABLE',
        'Cash on delivery is unavailable for this address.',
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
      paymentUrl: null,
      orderId: order?.id ?? null,
      paymentReviewRequired: attempt.paymentReviewRequired,
      allowedActions: [],
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
}
