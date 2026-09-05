import { DATABASE } from '@/common/constants/injection-tokens.constants';
import {
  InventoryPolicy,
  ProductStatus,
  ProductVariantStatus,
} from '@/common/enums';
import { VariantConflictError } from '@/common/errors';
import {
  productOptions,
  products,
  productVariants,
} from '@/infrastructure/database/schema/products.schema';
import { store } from '@/infrastructure/database/schema/app.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { and, asc, eq, sql } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseError } from 'pg';
import { Inject, Injectable } from '@nestjs/common';

export type CreateSimpleVariantInput = {
  price: number;
  compareAtPrice: number | null;
  weightGrams: number | null;
  sku: string;
  barcode: string;
  inventoryPolicy: InventoryPolicy;
  onHand: number | null;
};

export type UpdateSimpleVariantInput = Partial<
  Pick<
    typeof productVariants.$inferInsert,
    'price' | 'compareAtPrice' | 'weightGrams'
  >
>;

@Injectable()
export class ProductVariantsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async createSimple(
    storeId: string,
    productId: string,
    input: CreateSimpleVariantInput,
  ) {
    try {
      return await this.db.transaction(async (tx) => {
        const [product] = await tx
          .select({ id: products.id, status: products.status })
          .from(products)
          .where(and(eq(products.storeId, storeId), eq(products.id, productId)))
          .for('update');
        if (!product) return undefined;
        if (product.status !== ProductStatus.DRAFT) {
          throw new VariantConflictError(
            'Variants can only be created for a draft Product.',
          );
        }
        const [option] = await tx
          .select({ id: productOptions.id })
          .from(productOptions)
          .where(
            and(
              eq(productOptions.storeId, storeId),
              eq(productOptions.productId, productId),
            ),
          )
          .limit(1);
        if (option) {
          throw new VariantConflictError(
            'Configurable Product Variants must be managed with the option graph.',
          );
        }

        const [created] = await tx
          .insert(productVariants)
          .values({
            storeId,
            productId,
            title: 'Default',
            optionSignature: '',
            status: ProductVariantStatus.ACTIVE,
            ...input,
            reserved:
              input.inventoryPolicy === InventoryPolicy.TRACKED ? 0 : null,
          })
          .returning({ id: productVariants.id });

        if (!created) return undefined;

        const [variant] = await tx
          .select({
            id: productVariants.id,
            title: productVariants.title,
            sku: productVariants.sku,
            barcode: productVariants.barcode,
            price: productVariants.price,
            compareAtPrice: productVariants.compareAtPrice,
            weightGrams: productVariants.weightGrams,
            status: productVariants.status,
            inventoryPolicy: productVariants.inventoryPolicy,
            onHand: productVariants.onHand,
            reserved: productVariants.reserved,
            version: productVariants.version,
            createdAt: productVariants.createdAt,
            updatedAt: productVariants.updatedAt,
            currency: store.defaultCurrency,
            inStock: sql<boolean>`
              ${productVariants.inventoryPolicy} = ${InventoryPolicy.UNTRACKED}
              OR coalesce(${productVariants.onHand}, 0) - coalesce(${productVariants.reserved}, 0) > 0
            `,
          })
          .from(productVariants)
          .innerJoin(store, eq(store.id, productVariants.storeId))
          .where(eq(productVariants.id, created.id));
        return variant;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new VariantConflictError(
          'The default Variant or its SKU/barcode already exists.',
        );
      }
      throw error;
    }
  }

  async findMany(storeId: string, productId: string, includeArchived: boolean) {
    return this.db
      .select({
        id: productVariants.id,
        title: productVariants.title,
        sku: productVariants.sku,
        barcode: productVariants.barcode,
        price: productVariants.price,
        compareAtPrice: productVariants.compareAtPrice,
        weightGrams: productVariants.weightGrams,
        status: productVariants.status,
        inventoryPolicy: productVariants.inventoryPolicy,
        onHand: productVariants.onHand,
        reserved: productVariants.reserved,
        version: productVariants.version,
        createdAt: productVariants.createdAt,
        updatedAt: productVariants.updatedAt,
        currency: store.defaultCurrency,
        inStock: sql<boolean>`
          ${productVariants.inventoryPolicy} = ${InventoryPolicy.UNTRACKED}
          OR coalesce(${productVariants.onHand}, 0) - coalesce(${productVariants.reserved}, 0) > 0
        `,
      })
      .from(productVariants)
      .innerJoin(store, eq(store.id, productVariants.storeId))
      .where(
        and(
          eq(productVariants.storeId, storeId),
          eq(productVariants.productId, productId),
          ...(includeArchived
            ? []
            : [eq(productVariants.status, ProductVariantStatus.ACTIVE)]),
        ),
      )
      .orderBy(asc(productVariants.createdAt), asc(productVariants.id))
      .limit(5);
  }

  async productExists(storeId: string, productId: string): Promise<boolean> {
    const [product] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.storeId, storeId), eq(products.id, productId)))
      .limit(1);
    return Boolean(product);
  }

  async findOne(storeId: string, productId: string, variantId: string) {
    const [variant] = await this.db
      .select({
        id: productVariants.id,
        title: productVariants.title,
        sku: productVariants.sku,
        barcode: productVariants.barcode,
        price: productVariants.price,
        compareAtPrice: productVariants.compareAtPrice,
        weightGrams: productVariants.weightGrams,
        status: productVariants.status,
        inventoryPolicy: productVariants.inventoryPolicy,
        onHand: productVariants.onHand,
        reserved: productVariants.reserved,
        version: productVariants.version,
        createdAt: productVariants.createdAt,
        updatedAt: productVariants.updatedAt,
        currency: store.defaultCurrency,
        inStock: sql<boolean>`
          ${productVariants.inventoryPolicy} = ${InventoryPolicy.UNTRACKED}
          OR coalesce(${productVariants.onHand}, 0) - coalesce(${productVariants.reserved}, 0) > 0
        `,
      })
      .from(productVariants)
      .innerJoin(store, eq(store.id, productVariants.storeId))
      .where(
        and(
          eq(productVariants.storeId, storeId),
          eq(productVariants.productId, productId),
          eq(productVariants.id, variantId),
        ),
      );
    return variant;
  }

  async findBarcode(storeId: string, productId: string, variantId: string) {
    const [variant] = await this.db
      .select({ barcode: productVariants.barcode })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.storeId, storeId),
          eq(productVariants.productId, productId),
          eq(productVariants.id, variantId),
        ),
      );
    return variant;
  }

  async update(
    storeId: string,
    productId: string,
    variantId: string,
    expectedVersion: number,
    input: UpdateSimpleVariantInput,
  ) {
    try {
      const [variant] = await this.db
        .update(productVariants)
        .set({
          ...input,
          version: sql`${productVariants.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(productVariants.storeId, storeId),
            eq(productVariants.productId, productId),
            eq(productVariants.id, variantId),
            eq(productVariants.status, ProductVariantStatus.ACTIVE),
            eq(productVariants.version, expectedVersion),
          ),
        )
        .returning({ id: productVariants.id });
      return variant;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new VariantConflictError(
          'SKU or barcode already exists in this Store.',
        );
      }
      throw error;
    }
  }

  private isUniqueViolation(err: unknown, constraintName?: string): boolean {
    if (!(err instanceof DrizzleQueryError)) return false;
    if (!(err.cause instanceof DatabaseError)) return false;
    if (err.cause.code !== '23505') return false;

    return constraintName ? err.cause.constraint === constraintName : true;
  }
}
