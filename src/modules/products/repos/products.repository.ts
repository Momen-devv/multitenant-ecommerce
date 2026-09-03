import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { products } from '@/infrastructure/database/schema/products.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { and, eq } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseError } from 'pg';
import { SlugConflictError } from '@/common/errors/slug-conflict.error';
import type {
  CreateProductInput,
  IProductsRepository,
} from '../interfaces/repos';
import { Product } from '@/infrastructure/database/schema/schema.types';

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

  findOne(storeId: string, productId: string): Promise<Product | undefined> {
    return this.db.query.products.findFirst({
      where: and(eq(products.storeId, storeId), eq(products.id, productId)),
    });
  }

  private isUniqueViolation(err: unknown, constraintName?: string): boolean {
    if (!(err instanceof DrizzleQueryError)) return false;
    if (!(err.cause instanceof DatabaseError)) return false;
    if (err.cause.code !== '23505') return false;

    return constraintName ? err.cause.constraint === constraintName : true;
  }
}
