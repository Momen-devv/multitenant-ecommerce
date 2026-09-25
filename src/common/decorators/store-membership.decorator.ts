import {
  createParamDecorator,
  InternalServerErrorException,
  type ExecutionContext,
} from '@nestjs/common';
import type {
  StoreMembershipContext,
  StoreMembershipRequest,
} from '@/common/guards/store-membership.guard';

export const StoreMembership = createParamDecorator(
  (_data: unknown, context: ExecutionContext): StoreMembershipContext => {
    const request = context.switchToHttp().getRequest<StoreMembershipRequest>();

    if (!request.storeMembership) {
      throw new InternalServerErrorException(
        'StoreMembership requires StoreMembershipGuard.',
      );
    }

    return request.storeMembership;
  },
);
