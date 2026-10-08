# Feature modules

Feature modules own HTTP endpoints, business workflows, and repositories. [Common](../common/README.md) supplies shared request conventions; [infrastructure](../infrastructure/README.md) supplies database and provider integrations.

## Module map

| Module                                   | Responsibility                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| [Auth](auth/README.md)                   | Authentication, sessions, email verification, OAuth, linked accounts          |
| [Users](users/README.md)                 | Profiles, addresses, phone access, account lifecycle, platform administration |
| [Stores](stores/README.md)               | Store identity, organization membership, lifecycle, checkout settings         |
| [Plans](plans/README.md)                 | Plan catalog, recurring prices, Stripe provisioning                           |
| [Billing](billing/README.md)             | Platform subscription Stripe integration and webhook application              |
| [Subscriptions](subscriptions/README.md) | Store owner's current subscription, checkout, billing portal                  |
| [Products](products/README.md)           | Products, variants, options, inventory, images, public catalog                |
| [Categories](categories/README.md)       | Category lifecycle, ordering, product assignments, public browsing            |
| [Comments](comments/README.md)           | Product comments and AI moderation                                            |
| [Carts](carts/README.md)                 | Shopper carts scoped to individual Stores                                     |
| [Checkout](checkout/README.md)           | Shared Store checkout eligibility reader                                      |
| [Payments](payments/README.md)           | Merchant Connect onboarding and payment readiness                             |
| [Orders](orders/README.md)               | Quotes, purchase attempts, orders, fulfillment, payment recovery, refunds     |
| [Notifications](notifications/README.md) | Durable inbox, email delivery, preferences, event streams                     |
| [Assistant](assistant/README.md)         | Typed AI routing into supported management actions                            |
| [Health](health/README.md)               | Process liveness and dependency readiness                                     |

## Commerce flow

1. A user creates a Store and manages its organization membership.
2. The owner subscribes to a Plan through platform billing. Plan provisioning synchronizes the catalog with Stripe.
3. Staff prepare products, variants, images, and categories for public browsing.
4. The Store configures checkout options and connects its merchant account for online payments.
5. A shopper builds a Store-specific Cart, requests a quote, and starts checkout. `OrdersModule` owns these checkout endpoints; `CheckoutModule` supplies eligibility checks.
6. Cash-on-delivery checkout places an Order directly. Online checkout tracks a payment attempt and uses provider reconciliation to place the paid Order.
7. Staff manage fulfillment and refunds. Transactional notification and outbox records drive background delivery.

Platform subscription customers and merchant payment accounts serve different purposes. Keep subscription billing separate from shopper purchase payment state.

## Navigating and extending a feature

Controllers define routes and access requirements; DTOs define HTTP inputs and response schemas. Services orchestrate workflows, and repositories enforce persistence and transaction boundaries. Interfaces and tokens provide injectable contracts where the module declares them. Query definitions and cache policies are resource-specific.

Route examples in these guides use the application's `/api/v1` prefix. See [project setup](../../README.md) for cookies, CSRF, Swagger, and process roles. Consult controllers for exact payloads and permissions. Place a change in the module that owns the workflow, and update its README when behavior or operational recovery changes.
