import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InventoryPolicy } from '@/common/enums';
import type { ActiveStoreContext } from '@/common/guards/active-store.guard';
import { ProductVariantsRepository } from '../repos/product-variants.repository';
import { ProductVariantsService } from './product-variants.service';

describe('ProductVariantsService inventory updates', () => {
  const store = { storeId: 'store-id' } as ActiveStoreContext;
  const productId = 'product-id';
  const variantId = 'variant-id';
  let repository: {
    updateInventory: jest.Mock;
    findOne: jest.Mock;
  };
  let service: ProductVariantsService;

  beforeEach(() => {
    repository = {
      updateInventory: jest.fn(),
      findOne: jest.fn(),
    };
    service = new ProductVariantsService(
      repository as unknown as ProductVariantsRepository,
    );
  });

  it('returns the atomically updated inventory representation', async () => {
    const updated = {
      id: variantId,
      inventoryPolicy: InventoryPolicy.TRACKED,
      onHand: 8,
      reserved: 3,
      available: 5,
      version: 2,
    };
    repository.updateInventory.mockResolvedValue(updated);

    await expect(
      service.updateInventory(
        productId,
        variantId,
        {
          expectedVersion: 1,
          inventoryPolicy: InventoryPolicy.TRACKED,
          onHand: 8,
        },
        store,
      ),
    ).resolves.toBe(updated);

    expect(repository.updateInventory).toHaveBeenCalledWith(
      store.storeId,
      productId,
      variantId,
      1,
      { inventoryPolicy: InventoryPolicy.TRACKED, onHand: 8 },
    );
  });

  it.each([
    [{ expectedVersion: 1, inventoryPolicy: InventoryPolicy.TRACKED }],
    [
      {
        expectedVersion: 1,
        inventoryPolicy: InventoryPolicy.UNTRACKED,
        onHand: 0,
      },
    ],
  ])('rejects invalid inventory-policy input', async (dto) => {
    await expect(
      service.updateInventory(productId, variantId, dto, store),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updateInventory).not.toHaveBeenCalled();
  });

  it('maps an unchanged active Variant to a conflict', async () => {
    repository.updateInventory.mockResolvedValue(undefined);
    repository.findOne.mockResolvedValue({ id: variantId });

    await expect(
      service.updateInventory(
        productId,
        variantId,
        { expectedVersion: 1, onHand: 8 },
        store,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps scoped absence to not found', async () => {
    repository.updateInventory.mockResolvedValue(undefined);
    repository.findOne.mockResolvedValue(undefined);

    await expect(
      service.updateInventory(
        productId,
        variantId,
        { expectedVersion: 1, onHand: 8 },
        store,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
