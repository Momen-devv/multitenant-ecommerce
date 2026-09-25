import { ConflictException } from '@nestjs/common';
import { PlanProvisioningStatus } from '@/common/enums/plan-provisioning-status.enum';
import { PlatformPlansService } from './platform-plans.service';

describe('PlatformPlansService', () => {
  it('defaults new plan prices to USD before persisting them', async () => {
    const plansRepository = {
      createPendingWithPrices: jest.fn().mockResolvedValue({
        id: 'plan-id',
        code: 'pro',
        provisioningStatus: PlanProvisioningStatus.PENDING,
      }),
    };
    const service = new PlatformPlansService(
      plansRepository as never,
      {} as never,
      {} as never,
    );

    await service.createPlan({
      name: 'Pro',
      code: 'pro',
      features: {},
      limits: {},
      prices: [{ amount: 2900, interval: 'month' }],
    } as never);

    expect(plansRepository.createPendingWithPrices).toHaveBeenCalledWith(
      expect.objectContaining({
        prices: [{ amount: 2900, interval: 'month', currency: 'usd' }],
      }),
    );
  });

  it('updates Stripe product details before persisting plan updates', async () => {
    const plansRepository = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'plan-id', stripeProductId: 'prod_1' }),
      updatePlan: jest
        .fn()
        .mockResolvedValue({ id: 'plan-id', name: 'Business' }),
    };
    const billingCatalog = { updateProduct: jest.fn() };
    const service = new PlatformPlansService(
      plansRepository as never,
      {} as never,
      billingCatalog as never,
    );

    await expect(
      service.updatePlan('plan-id', { name: 'Business' }),
    ).resolves.toEqual({ id: 'plan-id', name: 'Business' });

    expect(billingCatalog.updateProduct).toHaveBeenCalledWith('prod_1', {
      name: 'Business',
    });
    expect(plansRepository.updatePlan).toHaveBeenCalledWith('plan-id', {
      name: 'Business',
    });
  });

  it('rejects provisioning retries for ready plans', async () => {
    const plansRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'plan-id',
        provisioningStatus: PlanProvisioningStatus.READY,
      }),
    };
    const service = new PlatformPlansService(
      plansRepository as never,
      {} as never,
      {} as never,
    );

    await expect(service.retryProvisioning('plan-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
