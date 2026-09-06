import {
  createParamDecorator,
  InternalServerErrorException,
  type ExecutionContext,
} from '@nestjs/common';
import type { ActiveStoreRequest } from '@/common/guards/active-store.guard';

export const ActiveStoreId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<ActiveStoreRequest>();
    const storeId = request.activeStore?.storeId;

    if (!storeId) {
      throw new InternalServerErrorException(
        'ActiveStoreId requires ActiveStoreGuard.',
      );
    }

    return storeId;
  },
);
