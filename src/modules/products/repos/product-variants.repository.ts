import { DATABASE } from '@/common/constants/injection-tokens.constants';
import {
  InventoryPolicy,
  ProductStatus,
  ProductVariantStatus,
  StoreStatus,
} from '@/common/enums';
import {
  StoreLifecycleConflictError,
  VariantConflictError,
} from '@/common/errors';
import {
  productOptionValues,
  productOptions,
  productVariantOptionValues,
  products,
  productVariants,
} from '@/infrastructure/database/schema/products.schema';
import { store } from '@/infrastructure/database/schema/app.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { and, asc, eq, lte, ne, or, sql } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseError } from 'pg';
import { Inject, Injectable } from '@nestjs/common';
import { deriveVariantPresentation } from '../domain/variant-catalog';
import { MAX_ACTIVE_PRODUCT_VARIANTS } from '../domain/product-catalog-limits';

export type CreateSimpleVariantInput = {
  price: number;
  compareAtPrice: number | null;
  weightGrams: number | null;
  sku: string;
  barcode: string;
  inventoryPolicy: InventoryPolicy;
  onHand: number | null;
  optionValueIds: string[];
};

export type UpdateSimpleVariantInput = Partial<
  Pick<
    typeof productVariants.$inferInsert,
    'price' | 'compareAtPrice' | 'weightGrams'
  >
>;

export type ReplaceVariantOptionValuesInput = {
  optionValueIds: string[];
};

export type UpdateVariantInventoryInput = {
  inventoryPolicy?: InventoryPolicy;
  onHand?: number;
};

@Injectable()
export class ProductVariantsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async createVariant(
    storeId: string,
    productId: string,
    input: CreateSimpleVariantInput,
  ) {
    try {
      return await this.db.transaction(async (tx) => {
        const { optionValueIds, ...variantInput } = input;
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
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.storeId, storeId),
              eq(productVariants.productId, productId),
              eq(productVariants.status, ProductVariantStatus.ACTIVE),
            ),
          );
        if (count >= MAX_ACTIVE_PRODUCT_VARIANTS) {
          throw new VariantConflictError(
            `A Product can have at most ${MAX_ACTIVE_PRODUCT_VARIANTS} active Variants.`,
          );
        }
        const optionRows = await tx
          .select({
            optionId: productOptions.id,
            optionPosition: productOptions.position,
            valueId: productOptionValues.id,
            value: productOptionValues.value,
          })
          .from(productOptions)
          .leftJoin(
            productOptionValues,
            eq(productOptionValues.optionId, productOptions.id),
          )
          .where(
            and(
              eq(productOptions.storeId, storeId),
              eq(productOptions.productId, productId),
            ),
          )
          .orderBy(asc(productOptions.position), asc(productOptions.id));
        const optionIds = new Set(optionRows.map((row) => row.optionId));
        const selectedValues = optionRows.filter((row) =>
          optionValueIds.includes(row.valueId ?? ''),
        );
        const selectedOptionIds = new Set(
          selectedValues.map((row) => row.optionId),
        );
        if (
          optionValueIds.length !== new Set(optionValueIds).size ||
          (optionIds.size === 0 && optionValueIds.length !== 0) ||
          (optionIds.size > 0 &&
            (selectedValues.length !== optionValueIds.length ||
              selectedOptionIds.size !== optionIds.size ||
              selectedValues.length !== optionIds.size))
        ) {
          throw new VariantConflictError(
            'Configurable Product Variants require one value from every Product option.',
          );
        }
        const selectedByOption = new Map(
          selectedValues.map((row) => [row.optionId, row]),
        );
        const selections = [...optionIds]
          .map((optionId) => selectedByOption.get(optionId))
          .filter((selection): selection is (typeof selectedValues)[number] =>
            Boolean(selection),
          )
          .sort((left, right) => left.optionPosition - right.optionPosition);
        const { optionSignature, title } = deriveVariantPresentation(
          selections.map((selection) => ({
            optionValueId: selection.valueId!,
            value: selection.value ?? '',
          })),
        );

        const [created] = await tx
          .insert(productVariants)
          .values({
            storeId,
            productId,
            title,
            optionSignature,
            status: ProductVariantStatus.ACTIVE,
            ...variantInput,
            reserved:
              variantInput.inventoryPolicy === InventoryPolicy.TRACKED
                ? 0
                : null,
          })
          .returning({ id: productVariants.id });

        if (!created) return undefined;

        if (selections.length > 0) {
          await tx.insert(productVariantOptionValues).values(
            selections.map((selection) => ({
              storeId,
              productId,
              variantId: created.id,
              optionId: selection.optionId,
              optionValueId: selection.valueId!,
            })),
          );
        }

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
            archivedAt: productVariants.archivedAt,
            inventoryPolicy: productVariants.inventoryPolicy,
            onHand: productVariants.onHand,
            reserved: productVariants.reserved,
            available: sql<
              number | null
            >`case when ${productVariants.inventoryPolicy} = ${InventoryPolicy.TRACKED} then ${productVariants.onHand} - ${productVariants.reserved} else null end`,
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

  async replaceOptionValues(
    storeId: string,
    productId: string,
    variantId: string,
    input: ReplaceVariantOptionValuesInput,
  ): Promise<boolean | undefined> {
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
            'Variant selections can only be changed for a draft Product.',
          );
        }

        const [variant] = await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.storeId, storeId),
              eq(productVariants.productId, productId),
              eq(productVariants.id, variantId),
              eq(productVariants.status, ProductVariantStatus.ACTIVE),
            ),
          )
          .for('update');
        if (!variant) return false;

        const optionRows = await tx
          .select({
            optionId: productOptions.id,
            optionPosition: productOptions.position,
            valueId: productOptionValues.id,
            value: productOptionValues.value,
          })
          .from(productOptions)
          .leftJoin(
            productOptionValues,
            eq(productOptionValues.optionId, productOptions.id),
          )
          .where(
            and(
              eq(productOptions.storeId, storeId),
              eq(productOptions.productId, productId),
            ),
          )
          .orderBy(
            asc(productOptions.position),
            asc(productOptionValues.position),
          );
        const optionCount = new Set(optionRows.map((row) => row.optionId)).size;
        const selectedValues = optionRows.filter((row) =>
          input.optionValueIds.includes(row.valueId ?? ''),
        );
        if (
          input.optionValueIds.length !== new Set(input.optionValueIds).size ||
          input.optionValueIds.length !== optionCount ||
          selectedValues.length !== optionCount ||
          new Set(selectedValues.map((row) => row.optionId)).size !==
            optionCount
        ) {
          throw new VariantConflictError(
            'Select exactly one current value from every Product option.',
          );
        }

        const selections = [...selectedValues].sort(
          (left, right) => left.optionPosition - right.optionPosition,
        );
        const { optionSignature, title } = deriveVariantPresentation(
          selections.map((selection) => ({
            optionValueId: selection.valueId!,
            value: selection.value ?? '',
          })),
        );

        await tx
          .delete(productVariantOptionValues)
          .where(
            and(
              eq(productVariantOptionValues.storeId, storeId),
              eq(productVariantOptionValues.productId, productId),
              eq(productVariantOptionValues.variantId, variantId),
            ),
          );
        if (selections.length > 0) {
          await tx.insert(productVariantOptionValues).values(
            selections.map((selection) => ({
              storeId,
              productId,
              variantId,
              optionId: selection.optionId,
              optionValueId: selection.valueId!,
            })),
          );
        }
        await tx
          .update(productVariants)
          .set({
            title,
            optionSignature,
            version: sql`${productVariants.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(productVariants.id, variantId));
        return true;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new VariantConflictError(
          'Another Variant already has this option selection.',
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
        archivedAt: productVariants.archivedAt,
        inventoryPolicy: productVariants.inventoryPolicy,
        onHand: productVariants.onHand,
        reserved: productVariants.reserved,
        available: sql<
          number | null
        >`case when ${productVariants.inventoryPolicy} = ${InventoryPolicy.TRACKED} then ${productVariants.onHand} - ${productVariants.reserved} else null end`,
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
      .orderBy(asc(productVariants.createdAt), asc(productVariants.id));
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
        archivedAt: productVariants.archivedAt,
        inventoryPolicy: productVariants.inventoryPolicy,
        onHand: productVariants.onHand,
        reserved: productVariants.reserved,
        available: sql<
          number | null
        >`case when ${productVariants.inventoryPolicy} = ${InventoryPolicy.TRACKED} then ${productVariants.onHand} - ${productVariants.reserved} else null end`,
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

  async updateInventory(
    storeId: string,
    productId: string,
    variantId: string,
    expectedVersion: number,
    input: UpdateVariantInventoryInput,
  ) {
    const isSwitchingToTracked =
      input.inventoryPolicy === InventoryPolicy.TRACKED;
    const isSwitchingToUntracked =
      input.inventoryPolicy === InventoryPolicy.UNTRACKED;
    const nextOnHand = input.onHand!;

    const balances = isSwitchingToUntracked
      ? {
          inventoryPolicy: InventoryPolicy.UNTRACKED,
          onHand: null,
          reserved: null,
        }
      : isSwitchingToTracked
        ? {
            inventoryPolicy: InventoryPolicy.TRACKED,
            onHand: nextOnHand,
            reserved: sql<number>`case when ${productVariants.inventoryPolicy} = ${InventoryPolicy.UNTRACKED} then 0 else ${productVariants.reserved} end`,
          }
        : { onHand: nextOnHand };

    const inventoryStateIsCompatible = isSwitchingToUntracked
      ? undefined
      : isSwitchingToTracked
        ? or(
            eq(productVariants.inventoryPolicy, InventoryPolicy.UNTRACKED),
            lte(productVariants.reserved, nextOnHand),
          )
        : and(
            eq(productVariants.inventoryPolicy, InventoryPolicy.TRACKED),
            lte(productVariants.reserved, nextOnHand),
          );

    const [variant] = await this.db
      .update(productVariants)
      .set({
        ...balances,
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
          ...(inventoryStateIsCompatible ? [inventoryStateIsCompatible] : []),
        ),
      )
      .returning({
        id: productVariants.id,
        title: productVariants.title,
        sku: productVariants.sku,
        barcode: productVariants.barcode,
        price: productVariants.price,
        compareAtPrice: productVariants.compareAtPrice,
        weightGrams: productVariants.weightGrams,
        status: productVariants.status,
        archivedAt: productVariants.archivedAt,
        inventoryPolicy: productVariants.inventoryPolicy,
        onHand: productVariants.onHand,
        reserved: productVariants.reserved,
        available: sql<
          number | null
        >`case when ${productVariants.inventoryPolicy} = ${InventoryPolicy.TRACKED} then ${productVariants.onHand} - ${productVariants.reserved} else null end`,
        version: productVariants.version,
        createdAt: productVariants.createdAt,
        updatedAt: productVariants.updatedAt,
        currency: sql<string>`(select ${store.defaultCurrency} from ${store} where ${store.id} = ${productVariants.storeId})`,
        inStock: sql<boolean>`
          ${productVariants.inventoryPolicy} = ${InventoryPolicy.UNTRACKED}
          OR coalesce(${productVariants.onHand}, 0) - coalesce(${productVariants.reserved}, 0) > 0
        `,
      });
    return variant;
  }

  async archiveVariant(
    storeId: string,
    productId: string,
    variantId: string,
    expectedVersion: number,
  ) {
    const archivedVariantId = await this.db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id, status: products.status })
        .from(products)
        .where(and(eq(products.storeId, storeId), eq(products.id, productId)))
        .for('update');
      if (!product) return undefined;

      const [lockedStore] = await tx
        .select({ status: store.status })
        .from(store)
        .where(eq(store.id, storeId))
        .for('update');
      if (lockedStore?.status !== StoreStatus.ACTIVE) {
        throw new StoreLifecycleConflictError(
          'The Store is no longer active and cannot be modified.',
        );
      }

      const [variant] = await tx
        .select({
          id: productVariants.id,
          status: productVariants.status,
          version: productVariants.version,
        })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.storeId, storeId),
            eq(productVariants.productId, productId),
            eq(productVariants.id, variantId),
          ),
        )
        .for('update');
      if (!variant) return undefined;
      if (variant.status === ProductVariantStatus.ARCHIVED) return variant.id;

      if (product.status === ProductStatus.ARCHIVED) {
        throw new VariantConflictError('Archived Products cannot be modified.');
      }
      if (variant.version !== expectedVersion) {
        throw new VariantConflictError(
          'Variant was changed by another request.',
        );
      }
      if (product.status === ProductStatus.PUBLISHED) {
        const hasReplacement = await this.hasOtherActiveVariant(
          tx,
          storeId,
          productId,
          variantId,
        );
        if (!hasReplacement) {
          throw new VariantConflictError(
            'A published Product must retain at least one active Variant.',
          );
        }
      }

      const archivedAt = new Date();
      const [archived] = await tx
        .update(productVariants)
        .set({
          status: ProductVariantStatus.ARCHIVED,
          archivedAt,
          version: sql`${productVariants.version} + 1`,
          updatedAt: archivedAt,
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
      if (!archived) {
        throw new VariantConflictError(
          'Variant was changed or archived by another request.',
        );
      }
      return archived.id;
    });

    if (!archivedVariantId) return undefined;
    return this.findOne(storeId, productId, archivedVariantId);
  }

  private async hasOtherActiveVariant(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    productId: string,
    excludedVariantId: string,
  ) {
    // Publishing validates catalog completeness. Published Products cannot
    // change their option structure, so archiving only needs a replacement.
    const [replacement] = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.storeId, storeId),
          eq(productVariants.productId, productId),
          eq(productVariants.status, ProductVariantStatus.ACTIVE),
          ne(productVariants.id, excludedVariantId),
        ),
      )
      .limit(1)
      .for('update');
    return Boolean(replacement);
  }

  private isUniqueViolation(err: unknown, constraintName?: string): boolean {
    if (!(err instanceof DrizzleQueryError)) return false;
    if (!(err.cause instanceof DatabaseError)) return false;
    if (err.cause.code !== '23505') return false;

    return constraintName ? err.cause.constraint === constraintName : true;
  }
}
