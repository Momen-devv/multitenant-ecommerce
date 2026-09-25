import { PlanPricesService } from './plan-prices.service';

describe('PlanPricesService', () => {
  it('defaults an added plan price to USD', async () => {
    const plansRepository = {
      createOrFindPendingPrice: jest.fn().mockResolvedValue({
        status: 'plan_not_found',
      }),
    };
    const service = new PlanPricesService(
      plansRepository as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.addPlanPrice('plan-id', {
        amount: 1500,
        interval: 'month',
      } as never),
    ).rejects.toThrow('Plan plan-id was not found');

    expect(plansRepository.createOrFindPendingPrice).toHaveBeenCalledWith(
      'plan-id',
      { amount: 1500, interval: 'month', currency: 'usd' },
    );
  });

  it('provisions and activates a ready pending price', async () => {
    const plansRepository = {
      createOrFindPendingPrice: jest.fn().mockResolvedValue({
        status: 'ready',
        plan: { id: 'plan-id', code: 'pro', stripeProductId: 'prod_1' },
        price: {
          id: 'price-id',
          amount: 1500,
          currency: 'usd',
          interval: 'month',
        },
      }),
      activatePendingPrice: jest
        .fn()
        .mockResolvedValue({ id: 'price-id', stripePriceId: 'price_1' }),
    };
    const billingCatalog = {
      createPlanPrice: jest
        .fn()
        .mockResolvedValue({ id: 'price_1', lookup_key: 'pro_month_usd' }),
    };
    const service = new PlanPricesService(
      plansRepository as never,
      {} as never,
      billingCatalog as never,
    );
    const dto = { amount: 1500, currency: 'usd', interval: 'month' };

    await expect(
      service.addPlanPrice('plan-id', dto as never),
    ).resolves.toEqual({ id: 'price-id', stripePriceId: 'price_1' });

    expect(billingCatalog.createPlanPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'plan-id',
        planPriceId: 'price-id',
        stripeProductId: 'prod_1',
      }),
    );
    expect(plansRepository.activatePendingPrice).toHaveBeenCalledWith({
      planId: 'plan-id',
      planPriceId: 'price-id',
      stripePriceId: 'price_1',
      stripeLookupKey: 'pro_month_usd',
    });
  });

  it('archives a provisioned price after deactivating it locally', async () => {
    const plansRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'plan-id' }),
      findPriceById: jest
        .fn()
        .mockResolvedValue({ id: 'price-id', stripePriceId: 'price_1' }),
      deactivatePrice: jest.fn(),
    };
    const billingCatalog = { archivePrice: jest.fn() };
    const service = new PlanPricesService(
      plansRepository as never,
      plansRepository as never,
      billingCatalog as never,
    );

    await service.deactivatePlanPrice('plan-id', 'price-id');

    expect(plansRepository.deactivatePrice).toHaveBeenCalledWith(
      'plan-id',
      'price-id',
    );
    expect(billingCatalog.archivePrice).toHaveBeenCalledWith('price_1');
  });
});
