import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateCheckoutQuoteDto,
  CheckoutQueryDto,
  OrderQueryDto,
  CancelOrderDto,
  DeliverOrderDto,
  OrderVersionDto,
  ReturnToStoreOrderDto,
  ShipOrderDto,
  StaffCancelOrderDto,
  StartCheckoutDto,
} from '../dto';
import { CheckoutRepository } from '../repos/checkout.repository';
import { OrdersRepository } from '../repos/orders.repository';
import { CHECKOUT_REPOSITORY, ORDERS_REPOSITORY } from '../interfaces';
import { OrganizationRole } from '@/common/enums';

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

  listStoreOrders(storeId: string, query: OrderQueryDto) {
    return this.orders.listForStore(storeId, query);
  }
  storeDetail(
    storeId: string,
    orderId: string,
    membershipRole: OrganizationRole,
  ) {
    return this.orders.findDetailForStore(storeId, orderId, membershipRole);
  }
  shopperCancel(
    userId: string,
    orderId: string,
    dto: CancelOrderDto,
    key?: string,
  ) {
    return this.orders.cancelByShopper(userId, orderId, dto, key);
  }
  prepare(
    userId: string,
    storeId: string,
    orderId: string,
    dto: OrderVersionDto,
    key?: string,
  ) {
    return this.orders.prepare(userId, storeId, orderId, dto, key);
  }
  ship(
    userId: string,
    storeId: string,
    orderId: string,
    dto: ShipOrderDto,
    key?: string,
  ) {
    return this.orders.ship(userId, storeId, orderId, dto, key);
  }
  deliver(
    userId: string,
    storeId: string,
    orderId: string,
    dto: DeliverOrderDto,
    key?: string,
  ) {
    return this.orders.deliver(userId, storeId, orderId, dto, key);
  }
  staffCancel(
    userId: string,
    storeId: string,
    orderId: string,
    dto: StaffCancelOrderDto,
    key?: string,
  ) {
    return this.orders.cancelByStaff(userId, storeId, orderId, dto, key);
  }
  returnToStore(
    userId: string,
    storeId: string,
    orderId: string,
    dto: ReturnToStoreOrderDto,
    key?: string,
  ) {
    return this.orders.returnToStore(userId, storeId, orderId, dto, key);
  }

  listAttempts(userId: string, query: CheckoutQueryDto) {
    return this.checkout.listAttempts(userId, query);
  }

  attemptDetail(userId: string, attemptId: string) {
    return this.checkout.attemptDetail(userId, attemptId);
  }
}
