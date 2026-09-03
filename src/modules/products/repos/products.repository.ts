import { DATABASE } from '@/common/constants/injection-tokens.constants';
import {
  productImages,
  productOptionValues,
  productOptions,
  productVariants,
  products,
} from '@/infrastructure/database/schema/products.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { and, asc, eq } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseError } from 'pg';
import { SlugConflictError } from '@/common/errors/slug-conflict.error';
import type {
  CreateProductInput,
  IProductsRepository,
  ProductAggregate,
} from '../interfaces/repos';

@Injectable()
export class ProductsRepository implements IProductsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(storeId: string, input: CreateProductInput) {
    try {
      const [product] = await this.db
        .insert(products)
        .values({ storeId, ...input })
        .returning();
      return product;
    } catch (error) {
      if (this.isUniqueViolation(error, 'products_store_slug_uidx')) {
        throw new SlugConflictError();
      }

      throw error;
    }
  }

  async findOne(
    storeId: string,
    productId: string,
  ): Promise<ProductAggregate | undefined> {
    return this.db.query.products.findFirst({
      where: and(eq(products.storeId, storeId), eq(products.id, productId)),
      with: {
        store: {
          columns: {
            defaultCurrency: true,
          },
        },
        images: {
          orderBy: [asc(productImages.position), asc(productImages.id)],
        },
        options: {
          orderBy: [asc(productOptions.position), asc(productOptions.id)],
          with: {
            values: {
              orderBy: [
                asc(productOptionValues.position),
                asc(productOptionValues.id),
              ],
            },
          },
        },
        variants: {
          orderBy: [asc(productVariants.createdAt), asc(productVariants.id)],
          with: {
            optionValues: {
              with: {
                optionValue: true,
              },
            },
          },
        },
      },
    });
  }

  private isUniqueViolation(err: unknown, constraintName?: string): boolean {
    if (!(err instanceof DrizzleQueryError)) return false;
    if (!(err.cause instanceof DatabaseError)) return false;
    if (err.cause.code !== '23505') return false;

    return constraintName ? err.cause.constraint === constraintName : true;
  }
}
