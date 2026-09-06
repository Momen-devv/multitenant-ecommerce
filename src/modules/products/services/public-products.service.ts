import { Injectable, NotFoundException } from '@nestjs/common';
import type { ApiListQueryInput } from '@/common/api-query';
import { PublicProductsRepository } from '../repos/public-products.repository';

@Injectable()
export class PublicProductsService {
  constructor(
    private readonly publicProductsRepository: PublicProductsRepository,
  ) {}

  async listPublishedProducts(storeSlug: string, query: ApiListQueryInput) {
    const page = await this.publicProductsRepository.findPublishedPage(
      storeSlug,
      query,
    );
    if (!page) throw new NotFoundException('Store not found');
    return page;
  }
}
