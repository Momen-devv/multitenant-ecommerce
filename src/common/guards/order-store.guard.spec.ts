import {
  ForbiddenException,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import { StoreStatus } from '@/common/enums';
import { OrderStoreGuard, type OrderStoreRequest } from './order-store.guard';

describe('OrderStoreGuard', () => {
  const storeRepository = { findStoreIdByOrganizationId: jest.fn() };
  const guard = new OrderStoreGuard(storeRepository as never);

  beforeEach(() => jest.resetAllMocks());

  it('resolves an inactive Store so owners can read or cancel Orders', async () => {
    const request = {
      session: { session: { activeOrganizationId: 'organization-1' } },
    } as OrderStoreRequest;
    storeRepository.findStoreIdByOrganizationId.mockResolvedValue({
      id: 'store-1',
      status: StoreStatus.OWNER_CLOSED,
      defaultCurrency: 'usd',
    });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request.orderStore).toEqual({
      organizationId: 'organization-1',
      storeId: 'store-1',
      currency: 'usd',
      status: StoreStatus.OWNER_CLOSED,
    });
  });

  it('rejects requests without an active organization', async () => {
    const request = { session: { session: {} } } as OrderStoreRequest;

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not expose a missing Store', async () => {
    const request = {
      session: { session: { activeOrganizationId: 'organization-1' } },
    } as OrderStoreRequest;
    storeRepository.findStoreIdByOrganizationId.mockResolvedValue(undefined);

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

function createContext(request: OrderStoreRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}
