import { OrderStatus } from '@/common/enums';
import {
  CheckoutInput,
  CheckoutReceipt,
  OrderDetail,
  OrderListResult,
} from './checkout.contract';

export interface OrderListQuery {
  status?: OrderStatus;
  cursor?: string;
  limit?: number;
}

export interface OrdersPort {
  placeOrder(
    cartId: string,
    cartToken: string,
    input: CheckoutInput,
  ): Promise<CheckoutReceipt>;
  listOrders(storeId: string, query: OrderListQuery): Promise<OrderListResult>;
  getOrder(storeId: string, orderId: string): Promise<OrderDetail>;
  fulfillOrder(
    storeId: string,
    orderId: string,
    actorId: string,
  ): Promise<OrderDetail>;
  cancelOrder(
    storeId: string,
    orderId: string,
    actorId: string,
    reason: string,
  ): Promise<OrderDetail>;
}
