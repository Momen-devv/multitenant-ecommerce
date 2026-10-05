export type CacheResource =
  | 'plan-detail'
  | 'plan-list'
  | 'product-detail'
  | 'product-list'
  | 'categories'
  | 'category-detail'
  | 'category-products'
  | 'infrastructure';

export type CacheScope = { kind: 'plans' } | { kind: 'store'; storeId: string };

export interface PayloadCodec<T> {
  encode(value: T): string;
  // Decode must validate the complete public projection; invalid data throws.
  decode(payload: string): T;
}

export interface ReadCachePolicy<T> {
  metricResource?: CacheResource;
  scope: CacheScope;
  resource: CacheResource;
  schemaVersion: number;
  keyHash: string;
  ttlSeconds: number;
  eligible: boolean;
  codec: PayloadCodec<T>;
}

export type ReadCacheKey = Pick<
  ReadCachePolicy<unknown>,
  'resource' | 'schemaVersion' | 'keyHash'
>;

export type CacheEvent =
  | 'hit'
  | 'miss'
  | 'bypass'
  | 'error'
  | 'invalidation-error'
  | 'invalidation-success'
  | 'malformed'
  | 'oversized'
  | 'coalesced'
  | 'graph-mismatch'
  | 'namespace-init'
  | 'namespace-rotation'
  | 'fill-skipped'
  | 'capacity-rejected';
export type CacheMeasurement =
  | 'redis-ms'
  | 'loader-ms'
  | 'http-ms'
  | 'payload-bytes';
