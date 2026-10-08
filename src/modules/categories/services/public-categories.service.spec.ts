import { NotFoundException } from '@nestjs/common';
import { PublicCategoriesService } from './public-categories.service';

describe('PublicCategoriesService', () => {
  const productsReader = {
    listCategoryProducts: jest.fn(),
    listPublishedProducts: jest.fn(),
  };
  let service: PublicCategoriesService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PublicCategoriesService(
      {} as never,
      productsReader,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('propagates a missing Category error from the product reader', async () => {
    const error = new NotFoundException('Published Category not found');
    productsReader.listCategoryProducts.mockRejectedValue(error);

    await expect(
      service.listCategoryProducts('store', 'empty-category', {}),
    ).rejects.toBe(error);
    expect(productsReader.listCategoryProducts).toHaveBeenCalledWith(
      'store',
      'empty-category',
      {},
    );
  });

  it('passes the Store, Category, and query to the product reader', async () => {
    productsReader.listCategoryProducts.mockResolvedValue({
      items: [{ slug: 'runner' }],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    await expect(
      service.listCategoryProducts('store', 'shoes', { limit: 10 }),
    ).resolves.toMatchObject({ items: [{ slug: 'runner' }] });
    expect(productsReader.listCategoryProducts).toHaveBeenCalledWith(
      'store',
      'shoes',
      { limit: 10 },
    );
  });
});
