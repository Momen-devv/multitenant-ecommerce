import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { ProductStatus, ProductVariantStatus } from '@/common/enums';
import { OptionGraphConflictError } from '@/common/errors';
import {
  productOptionValues,
  productOptions,
  productVariantOptionValues,
  productVariants,
  products,
} from '@/infrastructure/database/schema/products.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseError } from 'pg';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateProductOptionDto,
  CreateProductOptionValueDto,
  ReorderProductOptionValuesDto,
  UpdateProductOptionDto,
  UpdateProductOptionValueDto,
} from '../dto';

@Injectable()
export class ProductOptionsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findGraph(storeId: string, productId: string) {
    return this.db.query.products.findFirst({
      where: and(eq(products.storeId, storeId), eq(products.id, productId)),
      columns: {},
      with: {
        options: {
          columns: { id: true, name: true, position: true },
          orderBy: [asc(productOptions.position), asc(productOptions.id)],
          with: {
            values: {
              columns: { id: true, value: true, position: true },
              orderBy: [
                asc(productOptionValues.position),
                asc(productOptionValues.id),
              ],
            },
          },
        },
        variants: {
          where: eq(productVariants.status, ProductVariantStatus.ACTIVE),
          columns: { id: true },
          orderBy: [asc(productVariants.createdAt), asc(productVariants.id)],
          with: {
            optionValues: {
              columns: { optionId: true, optionValueId: true },
              orderBy: [
                asc(productVariantOptionValues.optionId),
                asc(productVariantOptionValues.optionValueId),
              ],
            },
          },
        },
      },
    });
  }

  async createOption(
    storeId: string,
    productId: string,
    input: CreateProductOptionDto,
  ) {
    return this.inDraftTransaction(storeId, productId, async (tx) => {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(productOptions)
        .where(
          and(
            eq(productOptions.storeId, storeId),
            eq(productOptions.productId, productId),
          ),
        );
      if (count >= 3) {
        throw new OptionGraphConflictError(
          'A Product can have at most three options.',
        );
      }
      const [option] = await tx
        .insert(productOptions)
        .values({
          storeId,
          productId,
          name: input.name.trim(),
          position: count,
        })
        .returning({
          id: productOptions.id,
          name: productOptions.name,
          position: productOptions.position,
        });
      await this.touchProduct(tx, productId);
      return option;
    });
  }

  async updateOption(
    storeId: string,
    productId: string,
    optionId: string,
    input: UpdateProductOptionDto,
  ): Promise<boolean | undefined> {
    return this.inDraftTransaction(storeId, productId, async (tx) => {
      const [option] = await tx
        .update(productOptions)
        .set({ name: input.name.trim(), updatedAt: new Date() })
        .where(
          and(
            eq(productOptions.storeId, storeId),
            eq(productOptions.productId, productId),
            eq(productOptions.id, optionId),
          ),
        )
        .returning({ id: productOptions.id });
      if (!option) return false;
      await this.touchProduct(tx, productId);
      return true;
    });
  }

  async deleteOption(
    storeId: string,
    productId: string,
    optionId: string,
  ): Promise<boolean | undefined> {
    return this.inDraftTransaction(storeId, productId, async (tx) => {
      const [option] = await tx
        .select({ id: productOptions.id, position: productOptions.position })
        .from(productOptions)
        .where(
          and(
            eq(productOptions.storeId, storeId),
            eq(productOptions.productId, productId),
            eq(productOptions.id, optionId),
          ),
        )
        .for('update');
      if (!option) return false;

      const [assignment] = await tx
        .select({ variantId: productVariantOptionValues.variantId })
        .from(productVariantOptionValues)
        .where(
          and(
            eq(productVariantOptionValues.storeId, storeId),
            eq(productVariantOptionValues.productId, productId),
            eq(productVariantOptionValues.optionId, optionId),
          ),
        )
        .limit(1);
      if (assignment) {
        throw new OptionGraphConflictError(
          'Reassign or archive Variants before deleting an option.',
        );
      }

      await tx
        .delete(productOptionValues)
        .where(
          and(
            eq(productOptionValues.storeId, storeId),
            eq(productOptionValues.productId, productId),
            eq(productOptionValues.optionId, optionId),
          ),
        );
      await tx.delete(productOptions).where(eq(productOptions.id, optionId));
      await this.closeOptionPositionGap(
        tx,
        storeId,
        productId,
        option.position,
      );
      await this.touchProduct(tx, productId);
      return true;
    });
  }

  async createValue(
    storeId: string,
    productId: string,
    optionId: string,
    input: CreateProductOptionValueDto,
  ) {
    return this.inDraftTransaction(storeId, productId, async (tx) => {
      const [option] = await tx
        .select({ id: productOptions.id })
        .from(productOptions)
        .where(
          and(
            eq(productOptions.storeId, storeId),
            eq(productOptions.productId, productId),
            eq(productOptions.id, optionId),
          ),
        )
        .for('update');
      if (!option) return undefined;
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(productOptionValues)
        .where(
          and(
            eq(productOptionValues.storeId, storeId),
            eq(productOptionValues.productId, productId),
            eq(productOptionValues.optionId, optionId),
          ),
        );
      const [value] = await tx
        .insert(productOptionValues)
        .values({
          storeId,
          productId,
          optionId,
          value: input.value.trim(),
          position: count,
        })
        .returning({
          id: productOptionValues.id,
          value: productOptionValues.value,
          position: productOptionValues.position,
        });
      await this.touchProduct(tx, productId);
      return value;
    });
  }

  async updateValue(
    storeId: string,
    productId: string,
    optionId: string,
    valueId: string,
    input: UpdateProductOptionValueDto,
  ): Promise<boolean | undefined> {
    return this.inDraftTransaction(storeId, productId, async (tx) => {
      const [value] = await tx
        .update(productOptionValues)
        .set({ value: input.value.trim(), updatedAt: new Date() })
        .where(
          and(
            eq(productOptionValues.storeId, storeId),
            eq(productOptionValues.productId, productId),
            eq(productOptionValues.optionId, optionId),
            eq(productOptionValues.id, valueId),
          ),
        )
        .returning({ id: productOptionValues.id });
      if (!value) return false;
      await this.refreshVariantGraph(tx, storeId, productId);
      await this.touchProduct(tx, productId);
      return true;
    });
  }

  async deleteValue(
    storeId: string,
    productId: string,
    optionId: string,
    valueId: string,
  ): Promise<boolean | undefined> {
    return this.inDraftTransaction(storeId, productId, async (tx) => {
      const [value] = await tx
        .select({
          id: productOptionValues.id,
          position: productOptionValues.position,
        })
        .from(productOptionValues)
        .where(
          and(
            eq(productOptionValues.storeId, storeId),
            eq(productOptionValues.productId, productId),
            eq(productOptionValues.optionId, optionId),
            eq(productOptionValues.id, valueId),
          ),
        )
        .for('update');
      if (!value) return false;

      const [assignment] = await tx
        .select({ variantId: productVariantOptionValues.variantId })
        .from(productVariantOptionValues)
        .where(
          and(
            eq(productVariantOptionValues.storeId, storeId),
            eq(productVariantOptionValues.productId, productId),
            eq(productVariantOptionValues.optionValueId, valueId),
          ),
        )
        .limit(1);
      if (assignment) {
        throw new OptionGraphConflictError(
          'Reassign or archive Variants before deleting an option value.',
        );
      }

      await tx
        .delete(productOptionValues)
        .where(eq(productOptionValues.id, valueId));
      await this.closeValuePositionGap(
        tx,
        storeId,
        productId,
        optionId,
        value.position,
      );
      await this.touchProduct(tx, productId);
      return true;
    });
  }

  async reorderValues(
    storeId: string,
    productId: string,
    optionId: string,
    input: ReorderProductOptionValuesDto,
  ): Promise<boolean | undefined> {
    return this.inDraftTransaction(storeId, productId, async (tx) => {
      const [option] = await tx
        .select({ id: productOptions.id })
        .from(productOptions)
        .where(
          and(
            eq(productOptions.storeId, storeId),
            eq(productOptions.productId, productId),
            eq(productOptions.id, optionId),
          ),
        )
        .for('update');
      if (!option) return false;
      const current = await tx
        .select({ id: productOptionValues.id })
        .from(productOptionValues)
        .where(
          and(
            eq(productOptionValues.storeId, storeId),
            eq(productOptionValues.productId, productId),
            eq(productOptionValues.optionId, optionId),
          ),
        );
      this.assertExactIds(
        current.map((value) => value.id),
        input.valueIds,
      );
      await tx
        .update(productOptionValues)
        .set({ position: sql`${productOptionValues.position} + 1000` })
        .where(
          and(
            eq(productOptionValues.storeId, storeId),
            eq(productOptionValues.productId, productId),
            eq(productOptionValues.optionId, optionId),
          ),
        );
      if (input.valueIds.length > 0) {
        const ordering = input.valueIds.map(
          (id, position) => sql`(${id}::uuid, ${position}::integer)`,
        );
        await tx.execute(sql`
          update ${productOptionValues}
          set position = ordering.position
          from (values ${sql.join(ordering, sql`, `)}) as ordering(id, position)
          where ${productOptionValues.id} = ordering.id
        `);
      }
      await this.touchProduct(tx, productId);
      return true;
    });
  }

  private async inDraftTransaction<Result>(
    storeId: string,
    productId: string,
    operation: (tx: NodePgDatabase<typeof schema>) => Promise<Result>,
  ): Promise<Result | undefined> {
    try {
      return await this.db.transaction(async (tx) => {
        const [product] = await tx
          .select({ id: products.id, status: products.status })
          .from(products)
          .where(and(eq(products.storeId, storeId), eq(products.id, productId)))
          .for('update');
        if (!product) return undefined;
        if (product.status !== ProductStatus.DRAFT) {
          throw new OptionGraphConflictError(
            'Options can only be changed for a draft Product.',
          );
        }
        return operation(tx);
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new OptionGraphConflictError(
          'Option names and values must be unique within a Product.',
        );
      }
      throw error;
    }
  }

  private async touchProduct(
    tx: NodePgDatabase<typeof schema>,
    productId: string,
  ) {
    await tx
      .update(products)
      .set({
        version: sql`${products.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));
  }

  private async refreshVariantGraph(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    productId: string,
  ) {
    await tx
      .update(productVariants)
      .set({
        optionSignature: sql`concat('refresh:', ${productVariants.id})`,
      })
      .where(
        and(
          eq(productVariants.storeId, storeId),
          eq(productVariants.productId, productId),
        ),
      );
    await tx.execute(sql`
      with selections as (
        select
          ${productVariantOptionValues.variantId} as variant_id,
          string_agg(
            ${productVariantOptionValues.optionValueId}::text,
            '|' order by ${productOptions.position}
          ) as option_signature,
          left(
            string_agg(
              ${productOptionValues.value},
              ' / ' order by ${productOptions.position}
            ),
            200
          ) as title
        from ${productVariantOptionValues}
        inner join ${productOptions}
          on ${productOptions.id} = ${productVariantOptionValues.optionId}
        inner join ${productOptionValues}
          on ${productOptionValues.id} = ${productVariantOptionValues.optionValueId}
        where ${productVariantOptionValues.storeId} = ${storeId}
          and ${productVariantOptionValues.productId} = ${productId}
        group by ${productVariantOptionValues.variantId}
      )
      update ${productVariants}
      set option_signature = selections.option_signature,
          title = selections.title,
          version = ${productVariants.version} + 1,
          updated_at = now()
      from selections
      where ${productVariants.id} = selections.variant_id
        and ${productVariants.storeId} = ${storeId}
        and ${productVariants.productId} = ${productId}
    `);
    await tx
      .update(productVariants)
      .set({
        optionSignature: '',
        title: 'Default',
        version: sql`${productVariants.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productVariants.storeId, storeId),
          eq(productVariants.productId, productId),
          sql`not exists (
            select 1
            from ${productVariantOptionValues}
            where ${productVariantOptionValues.variantId} = ${productVariants.id}
          )`,
        ),
      );
  }

  private async closeOptionPositionGap(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    productId: string,
    deletedPosition: number,
  ) {
    const scope = and(
      eq(productOptions.storeId, storeId),
      eq(productOptions.productId, productId),
    );
    if (deletedPosition === 0) {
      await tx
        .update(productOptions)
        .set({ position: 0 })
        .where(and(scope, eq(productOptions.position, 1)));
    }
    if (deletedPosition <= 1) {
      await tx
        .update(productOptions)
        .set({ position: 1 })
        .where(and(scope, eq(productOptions.position, 2)));
    }
  }

  private async closeValuePositionGap(
    tx: NodePgDatabase<typeof schema>,
    storeId: string,
    productId: string,
    optionId: string,
    deletedPosition: number,
  ) {
    await tx
      .update(productOptionValues)
      .set({ position: sql`${productOptionValues.position} + 1000` })
      .where(
        and(
          eq(productOptionValues.storeId, storeId),
          eq(productOptionValues.productId, productId),
          eq(productOptionValues.optionId, optionId),
          gt(productOptionValues.position, deletedPosition),
        ),
      );
    await tx
      .update(productOptionValues)
      .set({ position: sql`${productOptionValues.position} - 1001` })
      .where(
        and(
          eq(productOptionValues.storeId, storeId),
          eq(productOptionValues.productId, productId),
          eq(productOptionValues.optionId, optionId),
          gt(productOptionValues.position, 999),
        ),
      );
  }

  private assertExactIds(currentIds: string[], requestedIds: string[]) {
    if (
      currentIds.length !== requestedIds.length ||
      new Set(requestedIds).size !== requestedIds.length ||
      currentIds.some((id) => !requestedIds.includes(id))
    ) {
      throw new OptionGraphConflictError(
        'The order must contain every current item exactly once.',
      );
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof DrizzleQueryError &&
      error.cause instanceof DatabaseError &&
      error.cause.code === '23505'
    );
  }
}
