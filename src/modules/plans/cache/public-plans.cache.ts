import { z } from 'zod';
import type { CursorPage, PreparedApiQuery } from '@/common/api-query';
import { validatedQueryHash } from '@/infrastructure/cache/cache-key';
import type {
  PayloadCodec,
  ReadCachePolicy,
} from '@/infrastructure/cache/read-cache.types';
import type { PublicPlan } from '../interfaces/repos/public-plans-repository.interface';

const publicPlanSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    code: z.string(),
    description: z.string().nullable(),
    features: z.record(z.string(), z.boolean()),
    limits: z.record(z.string(), z.number().finite()),
    prices: z.array(
      z
        .object({
          id: z.string(),
          amount: z.number().int(),
          currency: z.string(),
          interval: z.enum(['month', 'year']),
        })
        .strict(),
    ),
  })
  .strict();

export function planDetailPolicy(
  code: string,
  eligible: boolean,
): ReadCachePolicy<PublicPlan> {
  const codec: PayloadCodec<PublicPlan> = {
    encode: (value) => JSON.stringify(publicPlanSchema.parse(value)),
    decode: (payload) => {
      const plan = publicPlanSchema.parse(JSON.parse(payload));
      if (plan.code !== code) throw new Error('Cached Plan code mismatch');
      return plan;
    },
  };
  return {
    scope: { kind: 'plans' },
    resource: 'plan-detail',
    schemaVersion: 1,
    keyHash: validatedQueryHash(code),
    ttlSeconds: 300,
    eligible,
    codec,
  };
}

export function planListPolicy(
  args: PreparedApiQuery['effectiveArguments'],
  enabled: boolean,
): ReadCachePolicy<CursorPage<Record<string, unknown>>> {
  // Lists can project any validated subset of the public Plan fields, but
  // always include active Prices. Do not reintroduce unselected fields on hits.
  const selectedFields = new Set(args.fields);
  const itemSchema = z
    .object(
      Object.fromEntries(
        Object.entries(publicPlanSchema.shape).filter(
          ([field]) => field === 'prices' || selectedFields.has(field),
        ),
      ),
    )
    .strict();
  const pageSchema = z
    .object({
      items: z.array(itemSchema).max(args.limit),
      pageInfo: z
        .object({
          nextCursor: z.string().nullable(),
          hasNextPage: z.boolean(),
        })
        .strict(),
    })
    .strict();
  return {
    scope: { kind: 'plans' },
    resource: 'plan-list',
    schemaVersion: 1,
    keyHash: validatedQueryHash(args),
    ttlSeconds: 300,
    eligible: enabled && args.cursor === null && args.search === null,
    codec: {
      encode: (value) => JSON.stringify(pageSchema.parse(value)),
      decode: (payload) => pageSchema.parse(JSON.parse(payload)),
    },
  };
}
