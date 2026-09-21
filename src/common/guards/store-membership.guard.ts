import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { CurrentUser } from '@/core/auth/auth.types';
import {
  STORE_REPOSITORY,
  type IStoreRepository,
} from '@/modules/stores/interfaces/repos';

export type StoreMembershipContext = {
  organizationId: string;
  storeId: string;
  currency: string;
  status: string;
};

export type StoreMembershipRequest = {
  session?: CurrentUser;
  storeMembership?: StoreMembershipContext;
};

@Injectable()
export class StoreMembershipGuard implements CanActivate {
  constructor(
    @Inject(STORE_REPOSITORY)
    private readonly storeRepository: IStoreRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<StoreMembershipRequest>();
    const organizationId = request.session?.session.activeOrganizationId;

    if (!organizationId) {
      throw new ForbiddenException('An active store organization is required.');
    }

    const store =
      await this.storeRepository.findByOrganizationId(organizationId);

    if (!store) {
      throw new NotFoundException(
        'Store not found for the active organization.',
      );
    }

    request.storeMembership = {
      organizationId,
      storeId: store.id,
      currency: store.defaultCurrency,
      status: store.status,
    };

    return true;
  }
}
