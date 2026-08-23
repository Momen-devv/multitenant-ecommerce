import { ConflictException } from '@nestjs/common';
import { PlanProvisioningStatus } from '@/common/enums/plan-provisioning-status.enum';
import { AdminPlansService } from './admin-plans.service';

describe('AdminPlansService', () => {
  it('updates Stripe product details before persisting plan updates', async () => {
    const plansRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'plan-id', stripeProductId: 'prod_1' }),
      updatePlan: jest.fn().mockResolvedValue({ id: 'plan-id', name: 'Business' }),
    };
    const billingCatalog = { updateProduct: jest.fn() };
    const service = new AdminPlansService(plansRepository as never, {} as never, billingCatalog as never);

    await expect(service.updatePlan('plan-id', { name: 'Business' })).resolves.toEqual({ id: 'plan-id', name: 'Business' });

    expect(billingCatalog.updateProduct).toHaveBeenCalledWith('prod_1', { name: 'Business' });
    expect(plansRepository.updatePlan).toHaveBeenCalledWith('plan-id', { name: 'Business' });
  });

  it('rejects provisioning retries for ready plans', async () => {
    const plansRepository = { findById: jest.fn().mockResolvedValue({ id: 'plan-id', provisioningStatus: PlanProvisioningStatus.READY }) };
    const service = new AdminPlansService(plansRepository as never, {} as never, {} as never);

    await expect(service.retryProvisioning('plan-id')).rejects.toBeInstanceOf(ConflictException);
  });
});
