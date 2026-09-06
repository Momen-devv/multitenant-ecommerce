import { DATABASE } from '@/common/constants/injection-tokens.constants';
import {
  ProductStatus,
  ProductVariantStatus,
  StoreStatus,
} from '@/common/enums';
import { compileApiQuery, type ApiListQueryInput } from '@/common/api-query';
import { store } from '@/infrastructure/database/schema/app.schema';
import {
  products,
  productVariants,
} from '@/infrastructure/database/schema/products.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Inject, Injectable } from '@nestjs/common';
import { publicProductQuery } from '../queries/public-product.query';

@Injectable()
export class PublicProductsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findPublishedPage(storeSlug: string, input: ApiListQueryInput) {
    return this.db.transaction(
      async (tx) => {
        const activeStore = await tx.query.store.findFirst({
          columns: { id: true, defaultCurrency: true },
          where: and(
            eq(store.slug, storeSlug),
            eq(store.status, StoreStatus.ACTIVE),
          ),
        });
        if (!activeStore) return undefined;

        const query = compileApiQuery(publicProductQuery, input);
        const rows = await tx.query.products.findMany({
          columns: query.columns,
          with: {
            variants: {
              columns: { price: true, compareAtPrice: true },
              where: eq(productVariants.status, ProductVariantStatus.ACTIVE),
              orderBy: [asc(productVariants.price), asc(productVariants.id)],
              limit: 1,
            },
          },
          where: and(
            eq(products.storeId, activeStore.id),
            eq(products.status, ProductStatus.PUBLISHED),
            query.where,
          ),
          orderBy: query.orderBy,
          limit: query.limit + 1,
        });

        return query.createPage(rows, ({ variants: [variant] }) => ({
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          currency: activeStore.defaultCurrency,
        }));
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
