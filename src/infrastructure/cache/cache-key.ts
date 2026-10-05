import { createHash } from 'node:crypto';
import type { CacheScope, ReadCacheKey } from './read-cache.types';

// Call only after domain/query validation and effective defaults are resolved.
// Array order (including sort priority) is deliberately preserved.
export function validatedQueryHash(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (
      input === null ||
      typeof input === 'string' ||
      typeof input === 'boolean'
    )
      return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (Array.isArray(input)) return input.map(canonical);
    if (
      input &&
      typeof input === 'object' &&
      Object.getPrototypeOf(input) === Object.prototype
    )
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      );
    throw new Error('Cache key requires normalized JSON values');
  }
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export function namespaceKey(
  environment: string,
  scope: CacheScope,
  prefix = 'ecommerce',
): string {
  const tag =
    scope.kind === 'plans'
      ? 'plans'
      : `store:${validatedQueryHash(scope.storeId)}`;
  return `${prefix}:${validatedQueryHash(environment)}:read:v1:{${tag}}:namespace`;
}

export function dataKey(
  namespace: string,
  token: string,
  policy: ReadCacheKey,
): string {
  return `${namespace}:${token}:${policy.resource}:v${policy.schemaVersion}:${policy.keyHash}`;
}
