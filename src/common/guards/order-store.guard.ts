import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { CurrentUser } from '@/core/auth/auth.types';
import { StoreStatus } from '@/common/enums';
import {
  STORE_REPOSITORY,
  type IStoreRepository,
} from '@/modules/stores/interfaces/repos';

export type OrderStoreContext = {
  organizationId: string;
  storeId: string;
  currency: string;
  status: StoreStatus;
};

export type OrderStoreRequest = {
  session?: CurrentUser;
  orderStore?: OrderStoreContext;
};

/**
 * Resolves the Store selected by an authenticated owner's active organization.
 * Unlike ActiveStoreGuard, Order reads and cancellations remain available after
 * a Store is closed or suspended.
 */
@Injectable()
export class OrderStoreGuard implements CanActivate {
  constructor(
    @Inject(STORE_REPOSITORY)
    private readonly storeRepository: IStoreRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OrderStoreRequest>();
    const organizationId = request.session?.session.activeOrganizationId;

    if (!organizationId) {
      throw new ForbiddenException('An active organization is required.');
    }

    const store =
      await this.storeRepository.findStoreIdByOrganizationId(organizationId);
    if (!store) {
      throw new NotFoundException(
        'Store not found for the active organization.',
      );
    }

    request.orderStore = {
      organizationId,
      storeId: store.id,
      currency: store.defaultCurrency,
      status: store.status,
    };
    return true;
  }
}
