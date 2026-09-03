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

export type ActiveStoreContext = {
  organizationId: string;
  storeId: string;
  currency: string;
};

export type ActiveStoreRequest = {
  session?: CurrentUser;
  activeStore?: ActiveStoreContext;
};

@Injectable()
export class ActiveStoreGuard implements CanActivate {
  constructor(
    @Inject(STORE_REPOSITORY)
    private readonly storeRepository: IStoreRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ActiveStoreRequest>();
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

    if (store.status !== StoreStatus.ACTIVE) {
      throw new ForbiddenException(
        'The active store is closed or suspended. Reactivate it before continuing.',
      );
    }

    request.activeStore = {
      organizationId,
      storeId: store.id,
      currency: store.defaultCurrency,
    };
    return true;
  }
}
