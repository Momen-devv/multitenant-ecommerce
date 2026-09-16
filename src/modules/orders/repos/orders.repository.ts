import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { CodedHttpError } from '@/common/errors';
import { user } from '@/infrastructure/database/schema/auth.schema';
import {
  orders,
  orderItems,
} from '@/infrastructure/database/schema/orders.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import type { OrderQueryDto } from '../dto';

type Database = NodePgDatabase<typeof schema>;

/** Owned shopper Order reads. Checkout writes stay in CheckoutRepository. */
@Injectable()
export class OrdersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listForUser(userId: string, query: OrderQueryDto) {
    await this.assertFreshUser(userId);
    const limit = query.limit ?? 20;
    const where = [eq(orders.userId, userId)];
    if (query['filter[storeId][eq]']) {
      where.push(eq(orders.storeId, query['filter[storeId][eq]']));
    }
    if (query['filter[status][eq]']) {
      where.push(eq(orders.status, query['filter[status][eq]'] as never));
    }
    if (query['filter[paymentMethod][eq]']) {
      where.push(
        eq(orders.paymentMethod, query['filter[paymentMethod][eq]'] as never),
      );
    }
    const rows = await this.db
      .select()
      .from(orders)
      .where(and(...where))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit + 1);
    return {
      items: rows.slice(0, limit).map((order) => this.summary(order)),
      pageInfo: { nextCursor: null, hasNextPage: rows.length > limit },
    };
  }

  async findDetailForUser(userId: string, orderId: string) {
    await this.assertFreshUser(userId);
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
    return {
      ...this.summary(order),
      version: order.version,
      refundedAmount: order.refundedAmount,
      accountContact: {
        email: order.accountEmail,
        phoneNumber: order.accountPhone,
      },
      shippingAddress: order.shippingAddress,
      shippingPolicy: order.shippingPolicy,
      items,
    };
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

  private async assertFreshUser(userId: string) {
    const [account] = await this.db
      .select({
        id: user.id,
        isActive: user.isActive,
        banned: user.banned,
        banExpires: user.banExpires,
      })
      .from(user)
      .where(eq(user.id, userId));
    if (
      !account ||
      !account.isActive ||
      (account.banned &&
        (!account.banExpires || account.banExpires > new Date()))
    ) {
      throw new CodedHttpError(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_UNAVAILABLE',
        'This account is not available.',
      );
    }
  }
}
