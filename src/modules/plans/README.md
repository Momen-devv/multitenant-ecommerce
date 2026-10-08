# Plans

Plans owns the platform Plan catalog, recurring Plan Prices, public listing, administrative lifecycle, and durable Stripe catalog provisioning.

## API and code map

Public reads use `/api/v1/plans` and `/api/v1/plans/:code`. Platform super admin routes use `/api/v1/platform/plans`, including activate/deactivate and provisioning retry, plus `/:id/prices` for price creation and deactivation.

`services/` separates public reads, platform writes, and Plan Prices. `queries/` defines allowed list fields and filters. `cache/` owns public Plan cache policies and invalidation. `repos/` persists catalog state through contracts in `interfaces/repos/`.

## Provisioning

Local catalog writes and provider synchronization are distinct steps. The [outbox dispatcher](provisioning/plan-provisioning-outbox.dispatcher.ts) publishes committed work to the Plan provisioning queue; the [reconciler](provisioning/plan-provisioning.reconciler.ts) recovers outstanding work. Both use Nest intervals and require scheduling to be enabled.

Inspect provisioning state before offering a Plan Price for subscription checkout. Administrative retry should use the existing endpoint and versioned provisioning workflow rather than manually creating duplicate Stripe resources. See [queues](../../infrastructure/queue/README.md) and [billing catalog integration](../billing/README.md).

Store subscriptions reference this catalog; [Subscriptions](../subscriptions/README.md) owns the owner-facing checkout and current subscription interface.
