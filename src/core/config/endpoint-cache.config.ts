import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { Environment } from '@/common/enums/environment.enum';

const flag = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');
const limit = (value: number, maximum: number) =>
  z.coerce.number().int().min(1).max(maximum).default(value);
export const endpointCacheEnvSchema = z.object({
  ENDPOINT_CACHE_REDIS_URL: z
    .url()
    .refine((v) => /^rediss?:/.test(v))
    .optional(),
  ENDPOINT_CACHE_ENABLED: flag,
  ENDPOINT_CACHE_PLAN_DETAILS_ENABLED: flag,
  ENDPOINT_CACHE_PLAN_LISTS_ENABLED: flag,
  ENDPOINT_CACHE_PRODUCT_LISTS_ENABLED: flag,
  ENDPOINT_CACHE_PRODUCT_DETAILS_ENABLED: flag,
  ENDPOINT_CACHE_CATEGORY_COLLECTIONS_ENABLED: flag,
  ENDPOINT_CACHE_CATEGORY_DETAILS_ENABLED: flag,
  ENDPOINT_CACHE_CATEGORY_PRODUCTS_ENABLED: flag,
  ENDPOINT_CACHE_PREFIX: z
    .string()
    .regex(/^[a-zA-Z0-9:_-]{1,80}$/)
    .default('ecommerce'),
  ENDPOINT_CACHE_COMMAND_TIMEOUT_MS: limit(100, 1000),
  ENDPOINT_CACHE_ATTEMPT_TIMEOUT_MS: limit(250, 2000),
  ENDPOINT_CACHE_SHUTDOWN_TIMEOUT_MS: limit(250, 2000),
  ENDPOINT_CACHE_LOAD_TIMEOUT_MS: limit(5000, 30000),
  ENDPOINT_CACHE_MAX_PAYLOAD_BYTES: limit(262144, 1048576),
  ENDPOINT_CACHE_MAX_TRACKED_LOADS: limit(256, 4096),
  ENDPOINT_CACHE_MAX_CONCURRENT_LOADS: limit(16, 256),
  ENDPOINT_CACHE_BREAKER_THRESHOLD: limit(5, 100),
  ENDPOINT_CACHE_BREAKER_COOLDOWN_MS: limit(5000, 60000),
});

export default registerAs('endpointCache', () => {
  const env = endpointCacheEnvSchema.parse(process.env);
  return {
    url:
      process.env.NODE_ENV === Environment.Benchmark
        ? process.env.BENCHMARK_REDIS_URL
        : (env.ENDPOINT_CACHE_REDIS_URL ?? process.env.REDIS_URL),
    environment: process.env.NODE_ENV ?? 'development',
    prefix: env.ENDPOINT_CACHE_PREFIX,
    enabled: env.ENDPOINT_CACHE_ENABLED,
    planDetailsEnabled: env.ENDPOINT_CACHE_PLAN_DETAILS_ENABLED,
    planListsEnabled: env.ENDPOINT_CACHE_PLAN_LISTS_ENABLED,
    productListsEnabled: env.ENDPOINT_CACHE_PRODUCT_LISTS_ENABLED,
    productDetailsEnabled: env.ENDPOINT_CACHE_PRODUCT_DETAILS_ENABLED,
    categoryCollectionsEnabled: env.ENDPOINT_CACHE_CATEGORY_COLLECTIONS_ENABLED,
    categoryDetailsEnabled: env.ENDPOINT_CACHE_CATEGORY_DETAILS_ENABLED,
    categoryProductsEnabled: env.ENDPOINT_CACHE_CATEGORY_PRODUCTS_ENABLED,
    categoryProductLoadTimeoutMs: env.ENDPOINT_CACHE_LOAD_TIMEOUT_MS,
    productDetailLoadTimeoutMs: env.ENDPOINT_CACHE_LOAD_TIMEOUT_MS,
    loadTimeoutMs: env.ENDPOINT_CACHE_LOAD_TIMEOUT_MS,
    commandTimeoutMs: env.ENDPOINT_CACHE_COMMAND_TIMEOUT_MS,
    attemptTimeoutMs: env.ENDPOINT_CACHE_ATTEMPT_TIMEOUT_MS,
    shutdownTimeoutMs: env.ENDPOINT_CACHE_SHUTDOWN_TIMEOUT_MS,
    maxPayloadBytes: env.ENDPOINT_CACHE_MAX_PAYLOAD_BYTES,
    maxTrackedLoads: env.ENDPOINT_CACHE_MAX_TRACKED_LOADS,
    maxConcurrentLoads: env.ENDPOINT_CACHE_MAX_CONCURRENT_LOADS,
    breakerThreshold: env.ENDPOINT_CACHE_BREAKER_THRESHOLD,
    breakerCooldownMs: env.ENDPOINT_CACHE_BREAKER_COOLDOWN_MS,
  };
});
