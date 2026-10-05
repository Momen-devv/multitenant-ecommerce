import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { products } from '@/infrastructure/database/schema/products.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { ReadCacheService } from '@/infrastructure/cache/read-cache.service';
import { beforeDeadline } from '@/infrastructure/cache/cache-deadline';
import { productDetailKey } from './public-products.cache';

@Injectable()
export class CatalogCacheInvalidator {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly cache: ReadCacheService,
  ) {}

  private async captureSlug(
    storeId: string,
    productId: string,
  ): Promise<string | undefined> {
    try {
      const product = await beforeDeadline(performance.now() + 100, () =>
        this.db.query.products.findFirst({
          columns: { slug: true },
          where: and(eq(products.storeId, storeId), eq(products.id, productId)),
        }),
      );
      return product?.slug;
    } catch {
      this.cache.record('product-detail', 'invalidation-error');
      return undefined;
    }
  }

  // The callback must resolve only after its standalone statement/transaction
  // commits. It must never be a callback inside an outer transaction.
  async commit<T>(
    storeId: string,
    productId: string | undefined,
    write: () => Promise<T>,
  ): Promise<T> {
    if (!this.cache.isConfigured()) return write();
    const oldSlug = productId
      ? await this.captureSlug(storeId, productId)
      : undefined;
    const result = await write(); // Database/domain failures propagate unchanged.
    if (result === undefined || result === false) return result;
    const slugs = new Set<string>();
    if (oldSlug) slugs.add(oldSlug);
    if (
      result &&
      typeof result === 'object' &&
      'slug' in result &&
      typeof result.slug === 'string'
    ) {
      slugs.add(result.slug);
    } else if (productId) {
      const currentSlug = await this.captureSlug(storeId, productId);
      if (currentSlug) slugs.add(currentSlug);
    }
    await this.afterCommit(storeId, [...slugs]);
    return result;
  }

  async afterCommit(storeId: string, slugs: string[] = []): Promise<void> {
    try {
      await this.cache.invalidate(
        { kind: 'store', storeId },
        slugs.map(productDetailKey),
        'product-list',
      );
    } catch {
      this.cache.record('product-list', 'invalidation-error');
    }
  }

  async commitCatalog<T>(storeId: string, write: () => Promise<T>): Promise<T> {
    const result = await write();
    if (result !== undefined && result !== false)
      await this.afterCommit(storeId);
    return result;
  }
}
