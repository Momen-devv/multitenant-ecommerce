import { Injectable, NotFoundException } from '@nestjs/common';
import type { ApiListQueryInput } from '@/common/api-query';
import { PublicProductsRepository } from '../repos/public-products.repository';

@Injectable()
export class PublicProductsService {
  constructor(
    private readonly publicProductsRepository: PublicProductsRepository,
  ) {}

  async listPublishedProducts(
    storeSlug: string,
    query: ApiListQueryInput,
    categorySlug?: string,
  ) {
    const page = await this.publicProductsRepository.findPublishedPage(
      storeSlug,
      query,
      categorySlug,
    );
    if (!page) throw new NotFoundException('Store not found');
    return page;
  }

  async getPublishedProduct(storeSlug: string, slug: string) {
    const product = await this.publicProductsRepository.findPublishedBySlug(
      storeSlug,
      slug,
    );
    if (!product) throw new NotFoundException('Published Product not found');
    return product;
  }
}
