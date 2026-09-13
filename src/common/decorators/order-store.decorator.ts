import {
  createParamDecorator,
  InternalServerErrorException,
  type ExecutionContext,
} from '@nestjs/common';
import type {
  OrderStoreContext,
  OrderStoreRequest,
} from '@/common/guards/order-store.guard';

export const OrderStore = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OrderStoreContext => {
    const request = context.switchToHttp().getRequest<OrderStoreRequest>();

    if (!request.orderStore) {
      throw new InternalServerErrorException(
        'OrderStore requires OrderStoreGuard.',
      );
    }

    return request.orderStore;
  },
);
