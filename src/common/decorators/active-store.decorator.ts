import {
  createParamDecorator,
  InternalServerErrorException,
  type ExecutionContext,
} from '@nestjs/common';
import type {
  ActiveStoreContext,
  ActiveStoreRequest,
} from '@/common/guards/active-store.guard';

export const ActiveStore = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ActiveStoreContext => {
    const request = context.switchToHttp().getRequest<ActiveStoreRequest>();

    if (!request.activeStore) {
      throw new InternalServerErrorException(
        'ActiveStore requires ActiveStoreGuard.',
      );
    }

    return request.activeStore;
  },
);
