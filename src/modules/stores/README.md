# Stores

Stores owns Store identity and lifecycle, its Better Auth organization, staff membership and invitations, and checkout settings. Store membership roles are owner, manager, and support; platform administration is a separate authority.

## HTTP surfaces

- `/api/v1/stores`: creation and owner operations under `me`, including metadata, logo, and closure.
- `/api/v1/stores/organization/set-active`: select the session's active organization.
- `/api/v1/stores/me`: access context, organization, members, invitations, role changes, and leaving.
- `/api/v1/stores/invitations`: the current user's invitation list and accept/reject operations.
- `/api/v1/stores/me/checkout-settings`: merchant checkout configuration.
- `/api/v1/stores/:storeId/checkout-options`: shopper checkout options.
- `/api/v1/platform/stores`: platform inspection, suspension, and reactivation.

See `controllers/` and `dto/` for exact methods and permissions. Selecting an active organization establishes request context; it does not grant permissions by itself.

## Lifecycle and tenant isolation

[StoreLifecycleService](services/store-lifecycle.service.ts) coordinates close, suspend, and reactivate operations. [Store status types](domain/store-status.ts) distinguish owner and platform actor authority. Lifecycle writes must preserve repository concurrency rules and associated notification behavior.

Use [ActiveStoreGuard](../../common/guards/active-store.guard.ts) for operations requiring an active Store. [StoreMembershipGuard](../../common/guards/store-membership.guard.ts) verifies membership while allowing operational routes to inspect closed or suspended Stores. Apply the feature's operation policy after resolving context.

Repositories scope resources by Store or organization. [Storefront cache context](repos/storefront-cache-context.reader.ts) supports public catalog reads. Changes affecting public visibility must remain consistent with the [catalog cache invalidator](../products/cache/catalog-cache.invalidator.ts).

Order acceptance also depends on [subscription eligibility](../checkout/README.md). Online payment readiness belongs to [Payments](../payments/README.md).
