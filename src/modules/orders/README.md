# Orders and purchase checkout

Orders owns shopper quotes and purchase attempts, immutable purchase snapshots, order history, staff fulfillment, payment reconciliation, refunds, and order email intents. `OrdersService` is the controller-facing entry point; repositories encapsulate locking, idempotency, and transaction boundaries.

## Shopper checkout

1. Read the Store-specific [Cart](../carts/README.md) and an owned shipping address.
2. Send `POST /api/v1/stores/:storeId/cart/quote` with `addressId`, `paymentMethod` (`cash_on_delivery` or `online`), and the current Cart `version`.
3. Review the returned items, contact/address snapshot, shipping policy, and totals. Quotes expire after five minutes.
4. Send `POST /api/v1/stores/:storeId/cart/checkout` with `quoteId` and a UUID `Idempotency-Key` header.
5. For online checkout, follow the returned `paymentUrl` when present and inspect the purchase attempt until the server records its result.

Quote validation and checkout start recheck purchase details. Changed Cart state, expired quotes, eligibility, or changed snapshot inputs may require a new quote. The quote does not itself reserve inventory.

Cash-on-delivery start places an Order transactionally. Online start persists an attempt and reserves inventory before coordinating a Stripe session. The browser redirect alone does not establish a paid Order; verified provider state and reconciliation complete placement.

Attempt routes use `/api/v1/users/me/checkouts`, with detail and cancel under `/:attemptId`. Shopper Order history uses `/api/v1/users/me/orders`, with detail and cancel under `/:orderId`. See [checkout controller](controllers/checkout.controller.ts), [shopper controller](controllers/user-orders.controller.ts), and [DTOs](dto/checkout.dto.ts).

## Staff order operations

Staff routes use `/api/v1/stores/me/orders` and resolve Store membership. Actions include prepare, ship, deliver, cancel, return-to-store, and refund retry. Each controller action defines its role policy.

Order statuses are `placed`, `preparing`, `shipped`, `delivered`, `cancelled`, and `returned`. Payment status is separate: `unpaid`, `paid`, `refund_pending`, `refunded`, or `refund_failed`.

Use the latest Order `version` and an idempotency key for versioned command endpoints. Preserve the key and payload when retrying the same command. The response's `allowedActions` and `paymentReviewRequired` help clients present current operational state; repository checks remain authoritative. COD delivery requires `cashCollected=true`; returns require confirmation that items were received. See [staff controller](controllers/store-orders.controller.ts).

## Persistence and recovery

- [CheckoutRepository](repos/checkout.repository.ts) owns quote snapshots, reservations, attempts, provider session creation, cancellation, and online placement.
- [OrdersRepository](repos/orders.repository.ts) owns Order reads, lifecycle commands, timeline, and refund state.
- [Purchase event handler](services/connect-purchase-event.handler.ts) connects merchant payment events to attempt processing.
- [Payment reconciliation](tasks/payment-reconciliation.task.ts) recovers due online attempts and refunds every 60 seconds.
- [Refund outbox dispatcher](tasks/refund-outbox.dispatcher.ts) prompts refund processing every 10 seconds; the refund row's lease governs recovery.
- [Order email dispatcher](tasks/order-email-outbox.dispatcher.ts) publishes durable email intents; [delivery persistence](repos/order-email-delivery.repository.ts) tracks delivery work.

These Nest interval tasks require a process with scheduling enabled. See [process roles](../../core/README.md), [outbox](../../infrastructure/outbox/README.md), [queues](../../infrastructure/queue/README.md), and [notifications](../notifications/README.md).

Keep stock release, payment review, refund state, and historical snapshots within the existing repository workflows. Manual changes to a single status can leave inventory or provider state inconsistent. Operator inspection/replay methods exist in CheckoutRepository; they are internal methods, not documented public HTTP endpoints.
