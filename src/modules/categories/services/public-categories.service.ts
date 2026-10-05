import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import endpointCacheConfig from '@/core/config/endpoint-cache.config';
import { ReadCacheService } from '@/infrastructure/cache/read-cache.service';
import { StorefrontCacheContextReader } from '@/modules/stores/repos/storefront-cache-context.reader';
import type { ApiListQueryInput } from '@/common/api-query';
import {
  PUBLIC_PRODUCT_LIST_READER,
  type PublicProductListReader,
} from '@/modules/products/interfaces/public-product-list-reader.interface';
import { PublicCategoriesRepository } from '../repos';
import { categoryCollectionPolicy } from '../cache/public-categories.cache';

@Injectable()
export class PublicCategoriesService {
  constructor(
    private readonly categoriesRepository: PublicCategoriesRepository,
    @Inject(PUBLIC_PRODUCT_LIST_READER)
    private readonly productsReader: PublicProductListReader,
    private readonly storefrontContext: StorefrontCacheContextReader,
    private readonly cache: ReadCacheService,
    @Inject(endpointCacheConfig.KEY)
    private readonly cacheConfig: ConfigType<typeof endpointCacheConfig>,
  ) {}

  async listCategories(storeSlug: string) {
    return this.visibleCollection(storeSlug, 'Store not found', false);
  }

  async getCategory(storeSlug: string, categorySlug: string) {
    const page = await this.visibleCollection(
      storeSlug,
      'Published Category not found',
      true,
    );
    const category = page.items.find((item) => item.slug === categorySlug);
    if (!category) throw new NotFoundException('Published Category not found');
    return category;
  }

  private async visibleCollection(
    storeSlug: string,
    missingMessage: string,
    detail: boolean,
  ) {
    // Cached visibility is public data; Store eligibility stays live on hits.
    const resource = detail ? 'category-detail' : 'categories';
    const activeStore = await this.cache.load(resource, () =>
      this.storefrontContext.findActive(storeSlug),
    );
    if (!activeStore) throw new NotFoundException(missingMessage);
    return this.cache.remember(
      categoryCollectionPolicy(
        activeStore.id,
        detail
          ? this.cacheConfig.categoryDetailsEnabled
          : this.cacheConfig.categoryCollectionsEnabled,
        detail,
      ),
      async () => {
        const page = await this.categoriesRepository.findVisible(
          storeSlug,
          activeStore.id,
        );
        if (!page) throw new NotFoundException(missingMessage);
        return page;
      },
    );
  }

  async listCategoryProducts(
    storeSlug: string,
    categorySlug: string,
    query: ApiListQueryInput,
  ) {
    return this.productsReader.listCategoryProducts(
      storeSlug,
      categorySlug,
      query,
    );
  }
}
