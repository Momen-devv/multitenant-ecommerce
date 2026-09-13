import { OrdersController } from './orders.controller';
import { StoreStatus } from '@/common/enums';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  OrgRoles: () => () => undefined,
  Session: () => () => undefined,
}));

describe('OrdersController', () => {
  const ordersRepository = {
    listOrders: jest.fn(),
    getOrder: jest.fn(),
    fulfillOrder: jest.fn(),
    cancelOrder: jest.fn(),
  };
  const controller = new OrdersController(ordersRepository as never);
  const inactiveStore = {
    organizationId: 'organization-1',
    storeId: 'store-1',
    currency: 'usd',
    status: StoreStatus.OWNER_CLOSED,
  };
  const session = { user: { id: 'owner-1' } };

  beforeEach(() => jest.resetAllMocks());

  it('scopes an inactive Store cancellation to the session-selected Store', async () => {
    const detail = { id: 'order-1', status: 'cancelled' };
    ordersRepository.cancelOrder.mockResolvedValue(detail);

    await expect(
      controller.cancel(
        'order-1',
        { reason: 'Customer asked to cancel.' },
        inactiveStore,
        session as never,
      ),
    ).resolves.toBe(detail);

    expect(ordersRepository.cancelOrder).toHaveBeenCalledWith(
      'store-1',
      'order-1',
      'owner-1',
      'Customer asked to cancel.',
    );
  });

  it('never accepts a Store ID from the owner Order list request', async () => {
    ordersRepository.listOrders.mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    await controller.list({ status: undefined, limit: 20 }, inactiveStore);

    expect(ordersRepository.listOrders).toHaveBeenCalledWith('store-1', {
      status: undefined,
      limit: 20,
    });
  });
});
