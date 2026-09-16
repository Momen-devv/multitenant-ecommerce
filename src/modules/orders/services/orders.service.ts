import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateCheckoutQuoteDto,
  OrderQueryDto,
  StartCheckoutDto,
} from '../dto';
import { CheckoutRepository } from '../repos/checkout.repository';
import { OrdersRepository } from '../repos/orders.repository';
import { CHECKOUT_REPOSITORY, ORDERS_REPOSITORY } from '../interfaces';

/**
 * The controller-facing interface for shopper checkout and Order history.
 * Database locking, snapshots, idempotency and persistence are deliberately
 * hidden in CheckoutRepository so callers cannot compose a partial checkout.
 */
@Injectable()
export class OrdersService {
  constructor(
    @Inject(CHECKOUT_REPOSITORY)
    private readonly checkout: CheckoutRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
  ) {}

  quote(userId: string, storeId: string, dto: CreateCheckoutQuoteDto) {
    return this.checkout.quote(userId, storeId, dto);
  }

  start(
    userId: string,
    storeId: string,
    dto: StartCheckoutDto,
    idempotencyKey: string | undefined,
  ) {
    return this.checkout.start(userId, storeId, dto, idempotencyKey);
  }

  listOrders(userId: string, query: OrderQueryDto) {
    return this.orders.listForUser(userId, query);
  }

  detail(userId: string, orderId: string) {
    return this.orders.findDetailForUser(userId, orderId);
  }

  listAttempts(userId: string, query: OrderQueryDto) {
    return this.checkout.listAttempts(userId, query);
  }

  attemptDetail(userId: string, attemptId: string) {
    return this.checkout.attemptDetail(userId, attemptId);
  }
}
