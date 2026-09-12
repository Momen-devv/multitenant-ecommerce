import { Injectable, NotFoundException } from '@nestjs/common';
import type { ApiListQueryInput } from '@/common/api-query';
import { PublicProductsRepository } from '@/modules/products/repos';
import { PublicCategoriesRepository } from '../repos';

@Injectable()
export class PublicCategoriesService {
  constructor(
    private readonly categoriesRepository: PublicCategoriesRepository,
    private readonly productsRepository: PublicProductsRepository,
  ) {}

  async listCategories(storeSlug: string) {
    const page = await this.categoriesRepository.findVisible(storeSlug);
    if (!page) throw new NotFoundException('Store not found');
    return page;
  }

  async getCategory(storeSlug: string, categorySlug: string) {
    const category = await this.categoriesRepository.findVisibleBySlug(
      storeSlug,
      categorySlug,
    );
    if (!category) throw new NotFoundException('Published Category not found');
    return category;
  }

  async listCategoryProducts(
    storeSlug: string,
    categorySlug: string,
    query: ApiListQueryInput,
  ) {
    await this.getCategory(storeSlug, categorySlug);
    const page = await this.productsRepository.findPublishedPage(
      storeSlug,
      query,
      categorySlug,
    );
    if (!page) throw new NotFoundException('Store not found');
    return page;
  }
}
