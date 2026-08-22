jest.mock('@thallesp/nestjs-better-auth', () => {
  const { SetMetadata } = jest.requireActual('@nestjs/common');
  return {
    AllowAnonymous: () => SetMetadata('ALLOW_ANONYMOUS', true),
    Roles: (roles: string[]) => SetMetadata('ROLES', roles),
  };
});

import { PlansController } from './plans.controller';

describe('PlansController public list-query adapter', () => {
  it('forwards public pagination, sorting, filtering, search, and field selection', async () => {
    const page = {
      items: [{ id: '019c0000-0000-7000-8000-000000000001', name: 'Pro' }],
      pageInfo: { nextCursor: null, hasNextPage: false },
    };
    const plansService = {
      listActivePlans: jest.fn().mockResolvedValue(page),
    };
    const controller = new PlansController(plansService as never);
    const query = {
      limit: 10,
      sort: 'name,-id',
      search: 'pro',
      fields: 'id,name',
      filter: { code: { eq: 'professional' } },
    };

    await expect(controller.listActivePlans(query)).resolves.toBe(page);
    expect(plansService.listActivePlans).toHaveBeenCalledWith(query);
  });
});
