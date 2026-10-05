import { z } from 'zod';
import type { CursorPage, PreparedApiQuery } from '@/common/api-query';
import { validatedQueryHash } from '@/infrastructure/cache/cache-key';
import type {
  ReadCacheKey,
  ReadCachePolicy,
} from '@/infrastructure/cache/read-cache.types';

export type PublicProductPage = CursorPage<Record<string, unknown>>;

export function productDetailKey(slug: string): ReadCacheKey {
  return {
    resource: 'product-detail',
    schemaVersion: 1,
    keyHash: validatedQueryHash(slug),
  };
}

const categorySummarySchema = z
  .object({ id: z.string().uuid(), name: z.string(), slug: z.string() })
  .strict();
const productAggregateSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    currency: z.string(),
    images: z.array(
      z
        .object({
          id: z.string().uuid(),
          publicUrl: z.string().nullable(),
          altText: z.string().nullable(),
        })
        .strict(),
    ),
    options: z.array(
      z
        .object({
          id: z.string().uuid(),
          name: z.string(),
          values: z.array(
            z.object({ id: z.string().uuid(), value: z.string() }).strict(),
          ),
        })
        .strict(),
    ),
    variants: z.array(
      z
        .object({
          id: z.string().uuid(),
          title: z.string(),
          price: z.number().int().nonnegative(),
          compareAtPrice: z.number().int().nonnegative().nullable(),
          weightGrams: z.number().int().nonnegative().nullable(),
          optionValues: z.array(
            z
              .object({
                optionId: z.string().uuid(),
                optionValueId: z.string().uuid(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    categories: z.array(categorySummarySchema),
  })
  .strict();

export type PublicProductAggregate = z.infer<typeof productAggregateSchema>;

export function productDetailPolicy(
  storeId: string,
  slug: string,
  enabled: boolean,
): ReadCachePolicy<PublicProductAggregate> {
  return {
    scope: { kind: 'store', storeId },
    ...productDetailKey(slug),
    ttlSeconds: 60,
    eligible: enabled,
    codec: {
      encode: (value) => JSON.stringify(productAggregateSchema.parse(value)),
      decode: (payload) => {
        const value = productAggregateSchema.parse(JSON.parse(payload));
        if (value.slug !== slug) throw new Error('Product slug mismatch');
        if (
          new Set(value.variants.map((variant) => variant.id)).size !==
          value.variants.length
        )
          throw new Error('Duplicate Product Variants');
        return value;
      },
    },
  };
}

// Dates are restored so cold and warm service results have the same types.
const dateSchema = z.union([
  z.date(),
  z.iso.datetime().transform((value) => new Date(value)),
]);
const fields = {
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
};
const extensions = {
  price: z.number().int().nonnegative(),
  compareAtPrice: z.number().int().nonnegative().nullable(),
  currency: z.string(),
  image: z
    .object({
      id: z.string().uuid(),
      publicUrl: z.string().nullable(),
      altText: z.string().nullable(),
    })
    .strict()
    .nullable(),
  categories: z.array(
    z
      .object({ id: z.string().uuid(), name: z.string(), slug: z.string() })
      .strict(),
  ),
};

export function productListPolicy(
  storeId: string,
  args: PreparedApiQuery['effectiveArguments'],
  categorySlug: string | undefined,
  enabled: boolean,
  requireVisibleCategory = false,
): ReadCachePolicy<PublicProductPage> {
  const selected = new Set(args.fields);
  const itemSchema = z
    .object({
      ...Object.fromEntries(
        Object.entries(fields).filter(([field]) => selected.has(field)),
      ),
      ...extensions,
    })
    .strict();
  const pageSchema = z
    .object({
      items: z.array(itemSchema).max(args.limit),
      pageInfo: z
        .object({ nextCursor: z.string().nullable(), hasNextPage: z.boolean() })
        .strict(),
    })
    .strict();
  return {
    scope: { kind: 'store', storeId },
    resource: requireVisibleCategory ? 'category-products' : 'product-list',
    schemaVersion: 1,
    keyHash: validatedQueryHash({
      ...args,
      categorySlug: categorySlug || null,
      requireVisibleCategory,
    }),
    ttlSeconds: 60,
    eligible: enabled && args.cursor === null && args.search === null,
    codec: {
      encode: (value) => JSON.stringify(pageSchema.parse(value)),
      decode: (payload) => pageSchema.parse(JSON.parse(payload)),
    },
  };
}
