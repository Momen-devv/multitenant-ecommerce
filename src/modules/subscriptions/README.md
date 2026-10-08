# Subscriptions

Subscriptions exposes the Store owner's current platform subscription and delegates Stripe checkout and portal creation to [Billing](../billing/README.md).

| Endpoint                              | Purpose                                     |
| ------------------------------------- | ------------------------------------------- |
| `GET /api/v1/subscriptions/current`   | Read the owned Store's current subscription |
| `POST /api/v1/subscriptions/checkout` | Start checkout for a Plan Price             |
| `POST /api/v1/subscriptions/portal`   | Open a billing portal session               |

[SubscriptionsService](services/subscriptions.service.ts) resolves the Store by the authenticated owner ID. These operations use the owned Store rather than accepting an arbitrary Store ID. Checkout forwards a validated idempotency key, selected Plan Price, and redirect URLs to Billing. See [DTOs](dto/index.ts) and [controller](controllers/subscriptions.controller.ts) for the HTTP contract.

The repository provides subscription reads to other features. [Checkout eligibility](../checkout/README.md) accepts active or trialing subscriptions for order acceptance. [Plan limits](domain/plan-limit.ts) are shared with catalog enforcement. Subscription state is updated through platform billing events; a browser redirect from Stripe does not replace webhook state application.
