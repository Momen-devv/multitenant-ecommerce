import {
  ForbiddenException,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import {
  ActiveStoreGuard,
  type ActiveStoreRequest,
} from './active-store.guard';
import { StoreStatus } from '@/common/enums';

describe('ActiveStoreGuard', () => {
  const storeRepository = {
    findStoreIdByOrganizationId: jest.fn(),
  };
  const guard = new ActiveStoreGuard(storeRepository as never);

  beforeEach(() => jest.resetAllMocks());

  it('resolves and attaches the active store context once per request', async () => {
    const request = {
      session: { session: { activeOrganizationId: 'organization-1' } },
    } as ActiveStoreRequest;
    storeRepository.findStoreIdByOrganizationId.mockResolvedValue({
      id: 'store-1',
      status: StoreStatus.ACTIVE,
      defaultCurrency: 'usd',
    });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(storeRepository.findStoreIdByOrganizationId).toHaveBeenCalledWith(
      'organization-1',
    );
    expect(request.activeStore).toEqual({
      organizationId: 'organization-1',
      storeId: 'store-1',
      currency: 'usd',
    });
  });

  it('rejects a request without an active organization', async () => {
    const request = { session: { session: {} } } as ActiveStoreRequest;

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storeRepository.findStoreIdByOrganizationId).not.toHaveBeenCalled();
  });

  it('rejects an active organization that does not have a store', async () => {
    const request = {
      session: { session: { activeOrganizationId: 'organization-1' } },
    } as ActiveStoreRequest;
    storeRepository.findStoreIdByOrganizationId.mockResolvedValue(undefined);

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an organization with an inactive store', async () => {
    const request = {
      session: { session: { activeOrganizationId: 'organization-1' } },
    } as ActiveStoreRequest;
    storeRepository.findStoreIdByOrganizationId.mockResolvedValue({
      id: 'store-1',
      status: StoreStatus.OWNER_CLOSED,
    });

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function createContext(request: ActiveStoreRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}
