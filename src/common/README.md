# Common

Shared HTTP behavior, provider contracts, query compilation, and commerce utilities live here. Feature services and persistence belong in [modules](../modules/README.md); external adapters belong in [infrastructure](../infrastructure/README.md).

## Request and response behavior

[AppModule](../app.module.ts) registers authentication, account availability, and throttling guards globally. `ActiveUserGuard` rejects authenticated users who are inactive or currently banned. Anonymous requests may proceed when the route allows them. The default throttle is 60 requests per 60 seconds, tracked by session user ID or IP, and skipped in development and benchmark modes.

[CorrelationIdMiddleware](middlewares/correlation-id.middleware.ts) accepts `X-Correlation-Id` or generates a UUID, returns it in the response header, and stores it in the asynchronous [request context](context/request-context.ts) for logging.

The [response interceptor](interceptors/transform-response.interceptor.ts) wraps successful handler results:

```json
{
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": {},
  "timestamp": "2026-01-01T00:00:00.000Z",
  "path": "/api/v1/example",
  "correlationId": "request-id"
}
```

Use `@ResponseMessage` for a route-specific message and `@SkipResponseTransform` on handlers that return a protocol-specific response. The [exception filter](filters/http-exception.filter.ts) returns status, error, message, timestamp, path, and correlation ID. Coded HTTP errors preserve `code` and `details`; validation message arrays receive `INVALID_INPUT`. Error stacks appear only in development.

## Store context and authorization

- [ActiveStoreGuard](guards/active-store.guard.ts) resolves the session's active organization to a Store and requires an active Store.
- [StoreMembershipGuard](guards/store-membership.guard.ts) verifies current membership and resolves Store ID, currency, status, and membership role. It does not require active Store status, allowing lifecycle and operational routes to apply their own policy.
- `@ActiveStore`, `@ActiveStoreId`, and `@StoreMembership` read the context attached by these guards.

Choose the guard that matches the workflow, and enforce operation-specific permissions in the feature. Scope repository reads and writes to the resolved Store; a resource ID alone does not establish access.

## Query and write conventions

See [API query helpers](api-query/README.md) for cursor pagination, projections, sorting, search, and filters. Each resource defines its own allowlist.

`@IdempotencyKey` reads the `Idempotency-Key` header. [ParseIdempotencyKeyPipe](pipes/parse-idempotency-key.pipe.ts) requires a UUID. These helpers only extract and validate the key; the feature repository owns request hashing, persistence, replay, and conflict handling. Reuse a key for retries of the same operation and payload; use a new key for a new operation.

Versioned DTOs let repositories detect stale writes. After a version conflict, read current state before deciding whether to retry.

## Other shared code

| Directory                       | Purpose                                                             |
| ------------------------------- | ------------------------------------------------------------------- |
| `abstracts/`                    | AI, mail, SMS, and storage provider contracts                       |
| `commerce/`                     | Currency and monetary limits shared by commerce features            |
| `constants/`                    | Shared dependency injection tokens                                  |
| `dto/`, `decorators/`, `pipes/` | HTTP schemas, metadata, validation, and parameter parsing           |
| `enums/`, `errors/`, `types/`   | Shared vocabulary, typed failures, and request shapes               |
| `events/`                       | Cross-feature event contracts                                       |
| `services/`                     | Image processing and secure token utilities                         |
| `utils/`                        | Hashing, IDs, timeouts, normalization, and other reusable functions |
