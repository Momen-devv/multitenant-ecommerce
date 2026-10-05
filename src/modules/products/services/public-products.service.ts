import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  prepareApiQuery,
  type ApiListQueryInput,
  type PreparedApiQuery,
} from '@/common/api-query';
import type { ConfigType } from '@nestjs/config';
import endpointCacheConfig from '@/core/config/endpoint-cache.config';
import { ReadCacheService } from '@/infrastructure/cache/read-cache.service';
import { StorefrontCacheContextReader } from '@/modules/stores/repos/storefront-cache-context.reader';
import { publicProductQuery } from '../queries/public-product.query';
import {
  productDetailPolicy,
  productListPolicy,
} from '../cache/public-products.cache';
import type { PublicProductListReader } from '../interfaces/public-product-list-reader.interface';
import { PublicProductsRepository } from '../repos/public-products.repository';

@Injectable()
export class PublicProductsService implements PublicProductListReader {
  constructor(
    private readonly publicProductsRepository: PublicProductsRepository,
    private readonly storefrontContext: StorefrontCacheContextReader,
    private readonly cache: ReadCacheService,
    @Inject(endpointCacheConfig.KEY)
    private readonly cacheConfig: ConfigType<typeof endpointCacheConfig>,
  ) {}

  async listPublishedProducts(
    storeSlug: string,
    query: ApiListQueryInput,
    categorySlug?: string,
  ) {
    return this.readPublishedPage(storeSlug, query, categorySlug, false);
  }

  async listCategoryProducts(
    storeSlug: string,
    categorySlug: string,
    query: ApiListQueryInput,
  ) {
    return this.readPublishedPage(storeSlug, query, categorySlug, true);
  }

  private async readPublishedPage(
    storeSlug: string,
    query: ApiListQueryInput,
    categorySlug: string | undefined,
    requireVisibleCategory: boolean,
  ) {
    const missingMessage = requireVisibleCategory
      ? 'Published Category not found'
      : 'Store not found';
    const resource = requireVisibleCategory
      ? 'category-products'
      : 'product-list';
    const activeStore = await this.cache.load(resource, () =>
      this.storefrontContext.findActive(storeSlug),
    );
    if (!activeStore) throw new NotFoundException(missingMessage);
    const authoritativeLoad = async () => {
      const page = await this.publicProductsRepository.findPublishedPage(
        storeSlug,
        query,
        categorySlug,
        activeStore.id,
        requireVisibleCategory,
      );
      if (!page) throw new NotFoundException(missingMessage);
      return page;
    };
    const deadline =
      performance.now() + this.cacheConfig.categoryProductLoadTimeoutMs;
    const load = authoritativeLoad;
    let prepared: PreparedApiQuery;
    try {
      prepared = prepareApiQuery(publicProductQuery, query);
    } catch (error) {
      if (!requireVisibleCategory || !(error instanceof BadRequestException))
        throw error;
      // Preserve the Category route's visibility-before-query error ordering.
      // This load checks visibility before compiling the same invalid query;
      // it never enters Redis or retries a database/domain failure.
      return this.cache.load(resource, load, deadline);
    }
    // Cache the visibility-checked page as one projection. No separately cached
    // Category is composed with a Product page from another namespace token.
    return this.cache.remember(
      productListPolicy(
        activeStore.id,
        prepared.effectiveArguments,
        categorySlug,
        requireVisibleCategory
          ? this.cacheConfig.categoryProductsEnabled
          : this.cacheConfig.productListsEnabled,
        requireVisibleCategory,
      ),
      load,
      deadline,
    );
  }

  async getPublishedProduct(storeSlug: string, slug: string) {
    const missing = () => new NotFoundException('Published Product not found');
    const activeStore = await this.cache.load('product-detail', () =>
      this.storefrontContext.findActive(storeSlug),
    );
    if (!activeStore) throw missing();
    const deadline =
      performance.now() + this.cacheConfig.productDetailLoadTimeoutMs;
    const authoritativeLoad = async () => {
      const product = await this.publicProductsRepository.findPublishedBySlug(
        storeSlug,
        slug,
        activeStore.id,
      );
      if (!product) throw missing();
      return product;
    };
    // The disabled policy keeps the original single-snapshot aggregate with
    // availability. Both paths pin the live Store identity before lookup.
    if (!this.cacheConfig.enabled || !this.cacheConfig.productDetailsEnabled) {
      this.cache.record('product-detail', 'bypass');
      return this.cache.load('product-detail', authoritativeLoad, deadline);
    }

    const policy = productDetailPolicy(activeStore.id, slug, true);
    const product = await this.cache.remember(
      policy,
      async () => {
        const aggregate =
          await this.publicProductsRepository.findPublishedAggregateBySlug(
            storeSlug,
            slug,
            activeStore.id,
          );
        if (!aggregate) throw missing();
        return aggregate;
      },
      deadline,
    );
    // Never cache or coalesce availability, including on cold/cache-error reads.
    const live = await this.cache.load(
      'product-detail',
      () =>
        this.publicProductsRepository.findLiveAvailability(
          activeStore.id,
          product.id,
        ),
      deadline,
    );
    const availability = new Map(
      live.map((variant) => [variant.id, variant.available]),
    );
    if (
      live.length !== product.variants.length ||
      product.variants.some((variant) => !availability.has(variant.id))
    ) {
      this.cache.record('product-detail', 'graph-mismatch');
      await this.cache.invalidate(policy.scope, [policy], 'product-detail');
      // Exactly one uncached reload: descriptions and availability come from
      // the same repeatable-read snapshot. Its errors propagate without retry.
      return this.cache.load('product-detail', authoritativeLoad, deadline);
    }
    return {
      ...product,
      variants: product.variants.map((variant) => ({
        ...variant,
        available: availability.get(variant.id)!,
      })),
    };
  }
}
