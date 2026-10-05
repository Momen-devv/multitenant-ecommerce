import { z } from 'zod';
import { validatedQueryHash } from '@/infrastructure/cache/cache-key';
import type { ReadCachePolicy } from '@/infrastructure/cache/read-cache.types';

const collectionSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string().uuid(),
          name: z.string(),
          slug: z.string(),
          description: z.string().nullable(),
          position: z.number().int().nonnegative(),
          productCount: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict();

export type PublicCategoryCollection = z.infer<typeof collectionSchema>;

export function categoryCollectionPolicy(
  storeId: string,
  enabled: boolean,
  detail = false,
): ReadCachePolicy<PublicCategoryCollection> {
  return {
    scope: { kind: 'store', storeId },
    resource: 'categories',
    metricResource: detail ? 'category-detail' : 'categories',
    schemaVersion: 1,
    keyHash: validatedQueryHash('visible-collection'),
    ttlSeconds: 60,
    eligible: enabled,
    codec: {
      encode: (value) => JSON.stringify(collectionSchema.parse(value)),
      decode: (payload) => collectionSchema.parse(JSON.parse(payload)),
    },
  };
}
