import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CategoryAssignmentNotFoundError } from '@/common/errors';
import { ProductLifecycleConflictError } from '@/common/errors';

describe('ProductsService Category membership', () => {
  const repository = {
    create: jest.fn(),
    replaceCategories: jest.fn(),
  };
  const subscriptions = {
    findCurrentPlanEntitlementByStoreId: jest.fn(),
  };
  const store = {
    storeId: '0199a111-1111-7111-8111-111111111111',
    organizationId: 'org-1',
    currency: 'usd',
  };
  const categoryId = '0199a222-2222-7222-8222-222222222222';
  let service: ProductsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ProductsService(repository as never, subscriptions as never);
  });

  it('passes initial Category memberships into atomic Product creation', async () => {
    subscriptions.findCurrentPlanEntitlementByStoreId.mockResolvedValue({
      status: 'active',
      plan: { limits: { products: 10 } },
    });
    repository.create.mockResolvedValue({ id: 'product-1' });

    await service.createProduct(
      { name: 'Shoe', categoryIds: [categoryId] },
      store,
    );

    expect(repository.create).toHaveBeenCalledWith(
      store.storeId,
      expect.objectContaining({ categoryIds: [categoryId] }),
      10,
    );
  });

  it('does not reveal whether an assigned Category belongs to another Store', async () => {
    repository.replaceCategories.mockRejectedValue(
      new CategoryAssignmentNotFoundError(),
    );

    await expect(
      service.replaceProductCategories(
        '0199a333-3333-7333-8333-333333333333',
        { categoryIds: [categoryId], expectedVersion: 1 },
        store,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports stale membership replacement as a conflict', async () => {
    repository.replaceCategories.mockRejectedValue(
      new ProductLifecycleConflictError('Product changed during this request.'),
    );

    await expect(
      service.replaceProductCategories(
        '0199a333-3333-7333-8333-333333333333',
        { categoryIds: [], expectedVersion: 1 },
        store,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
