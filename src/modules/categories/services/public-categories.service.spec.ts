import { NotFoundException } from '@nestjs/common';
import { PublicCategoriesService } from './public-categories.service';

describe('PublicCategoriesService', () => {
  const categoriesRepository = {
    findVisible: jest.fn(),
    findVisibleBySlug: jest.fn(),
  };
  const productsRepository = {
    findPublishedPage: jest.fn(),
  };
  let service: PublicCategoriesService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PublicCategoriesService(
      categoriesRepository as never,
      productsRepository as never,
    );
  });

  it('rejects nested Product browsing for a hidden or empty Category', async () => {
    categoriesRepository.findVisibleBySlug.mockResolvedValue(undefined);

    await expect(
      service.listCategoryProducts('store', 'empty-category', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(productsRepository.findPublishedPage).not.toHaveBeenCalled();
  });

  it('uses the same filtered Product query for a visible nested Category', async () => {
    categoriesRepository.findVisibleBySlug.mockResolvedValue({ slug: 'shoes' });
    productsRepository.findPublishedPage.mockResolvedValue({
      items: [{ slug: 'runner' }],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    await expect(
      service.listCategoryProducts('store', 'shoes', { limit: 10 }),
    ).resolves.toMatchObject({ items: [{ slug: 'runner' }] });
    expect(productsRepository.findPublishedPage).toHaveBeenCalledWith(
      'store',
      { limit: 10 },
      'shoes',
    );
  });
});
