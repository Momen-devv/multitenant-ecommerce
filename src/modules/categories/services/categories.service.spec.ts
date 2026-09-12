import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CategoryStatus, SubscriptionStatus } from '@/common/enums';
import { CategoriesService } from './categories.service';
import { CATEGORIES_REPOSITORY } from '../interfaces/repos';
import { SUBSCRIPTIONS_REPOSITORY } from '@/modules/subscriptions/interfaces/repos';
import {
  CategoryLimitExceededError,
  CategoryVersionConflictError,
} from '@/common/errors';

describe('CategoriesService', () => {
  const repository = {
    create: jest.fn(),
    findOne: jest.fn(),
    findPage: jest.fn(),
    update: jest.fn(),
    transitionStatus: jest.fn(),
    archive: jest.fn(),
    reorder: jest.fn(),
  };
  const subscriptions = {
    findCurrentPlanEntitlementByStoreId: jest.fn(),
  };
  const store = {
    storeId: '0199a111-1111-7111-8111-111111111111',
    organizationId: 'org-1',
    currency: 'usd',
  };
  let service: CategoriesService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: CATEGORIES_REPOSITORY, useValue: repository },
        { provide: SUBSCRIPTIONS_REPOSITORY, useValue: subscriptions },
      ],
    }).compile();
    service = module.get(CategoriesService);
  });

  it('creates a draft Category with a generated slug under the Store plan limit', async () => {
    subscriptions.findCurrentPlanEntitlementByStoreId.mockResolvedValue({
      status: SubscriptionStatus.ACTIVE,
      plan: { limits: { categories: 5 } },
    });
    repository.create.mockResolvedValue({ id: 'category-1' });

    await service.createCategory({ name: 'Summer Shoes' }, store);

    expect(repository.create).toHaveBeenCalledWith(
      store.storeId,
      { name: 'Summer Shoes', slug: 'summer-shoes', description: null },
      5,
    );
  });

  it('rejects creation when the subscription has no Category entitlement', async () => {
    subscriptions.findCurrentPlanEntitlementByStoreId.mockResolvedValue({
      status: SubscriptionStatus.ACTIVE,
      plan: { limits: {} },
    });

    await expect(
      service.createCategory({ name: 'Shoes' }, store),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('maps an exhausted Category quota to a forbidden response', async () => {
    subscriptions.findCurrentPlanEntitlementByStoreId.mockResolvedValue({
      status: SubscriptionStatus.TRIALING,
      plan: { limits: { categories: 1 } },
    });
    repository.create.mockRejectedValue(new CategoryLimitExceededError(1, 1));

    await expect(
      service.createCategory({ name: 'Shoes' }, store),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns the same not-found response for missing and cross-Store Categories', async () => {
    repository.findOne.mockResolvedValue(undefined);

    await expect(
      service.getCategory('0199a222-2222-7222-8222-222222222222', store),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps stale Category writes to conflict', async () => {
    repository.update.mockRejectedValue(new CategoryVersionConflictError());

    await expect(
      service.updateCategory(
        '0199a222-2222-7222-8222-222222222222',
        { name: 'Shoes', expectedVersion: 1 },
        store,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows draft and published transitions through the public service seam', async () => {
    repository.transitionStatus.mockResolvedValue({
      id: 'category-1',
      status: CategoryStatus.PUBLISHED,
    });

    await expect(
      service.updateCategoryStatus(
        '0199a222-2222-7222-8222-222222222222',
        { status: CategoryStatus.PUBLISHED, expectedVersion: 1 },
        store,
      ),
    ).resolves.toMatchObject({ status: CategoryStatus.PUBLISHED });
  });
});
