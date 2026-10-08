# Cache

`CacheModule` exposes general Redis operations and a separate client for public endpoint read caching.

## Providers

- `CACHE_SERVICE`: `RedisService`, implementing `ICacheService` with string `get`, `set`, `setex`, `del`, `exists`, and `ping` operations.
- `CACHE_CLIENT`: the shared ioredis client for consumers that need native Redis commands.
- `ReadCacheService`: policy-driven public read caching with codecs, deadlines, load coalescing, capacity limits, and namespace invalidation.

The module is global. The general Redis service verifies connectivity at startup and closes its client during shutdown. Redis is required for readiness and also supports authentication, throttling, and BullMQ.

## Configuration

| Variable                            | Behavior                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `REDIS_URL`                         | Required general Redis connection                                                   |
| `BENCHMARK_REDIS_URL`               | Runtime Redis connection in benchmark mode                                          |
| `ENDPOINT_CACHE_REDIS_URL`          | Optional separate endpoint cache; otherwise uses `REDIS_URL` outside benchmark mode |
| `ENDPOINT_CACHE_ENABLED`            | Enable endpoint caching; defaults to `true`                                         |
| `ENDPOINT_CACHE_PREFIX`             | Key prefix; defaults to `ecommerce`                                                 |
| `ENDPOINT_CACHE_COMMAND_TIMEOUT_MS` | Redis command deadline; defaults to 100 ms                                          |
| `ENDPOINT_CACHE_ATTEMPT_TIMEOUT_MS` | Cache attempt deadline; defaults to 250 ms                                          |
| `ENDPOINT_CACHE_LOAD_TIMEOUT_MS`    | Loader deadline; defaults to 5,000 ms                                               |
| `ENDPOINT_CACHE_MAX_PAYLOAD_BYTES`  | Maximum cached payload; defaults to 262,144 bytes                                   |

Independent switches cover plan details/lists, product details/lists, category collections/details/products. See [endpoint-cache.config.ts](../../core/config/endpoint-cache.config.ts) for all flags, limits, and validation ranges. Benchmark endpoint caching uses `BENCHMARK_REDIS_URL`.

## Public read caching

Call `ReadCacheService.remember` with a `ReadCachePolicy` and a database loader. Policies specify the resource, Store or plans scope, schema version, normalized key hash, TTL in seconds, eligibility, and a codec that validates the complete cached projection.

Invalidate affected namespaces after a committed mutation using `ReadCacheService.invalidate`. Keep private or personalized projections out of public caches and include the Store scope in tenant-specific policies. Feature cache classes contain the concrete policies.

Endpoint caching falls back to loading data when cache access fails. Its health is reported separately in readiness output; this does not make the general Redis connection optional.
