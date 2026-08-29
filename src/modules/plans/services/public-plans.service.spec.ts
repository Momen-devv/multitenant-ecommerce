import { NotFoundException } from '@nestjs/common';
import { PublicPlansService } from './public-plans.service';

describe('PublicPlansService', () => {
  it('forwards active-plan list queries to the repository', () => {
    const plansRepository = {
      findActivePage: jest.fn().mockReturnValue({ items: [] }),
    };
    const service = new PublicPlansService(plansRepository as never);
    const query = { limit: 10, search: 'pro' };

    expect(service.listActivePlans(query)).toEqual({ items: [] });
    expect(plansRepository.findActivePage).toHaveBeenCalledWith(query);
  });

  it('normalizes the public plan code before looking it up', async () => {
    const plansRepository = {
      findActiveByCode: jest
        .fn()
        .mockResolvedValue({ id: 'plan-id', code: 'pro' }),
    };
    const service = new PublicPlansService(plansRepository as never);

    await expect(service.getActivePlanByCode(' Pro ')).resolves.toEqual({
      id: 'plan-id',
      code: 'pro',
    });
    expect(plansRepository.findActiveByCode).toHaveBeenCalledWith('pro');
  });

  it('reports a missing active plan', async () => {
    const service = new PublicPlansService({
      findActiveByCode: jest.fn().mockResolvedValue(undefined),
    } as never);

    await expect(service.getActivePlanByCode('pro')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
