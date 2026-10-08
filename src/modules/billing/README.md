# Billing

Billing implements Stripe integration for the platform's recurring Store subscriptions: catalog synchronization, subscription checkout, billing portal sessions, and platform webhook state application.

## Integration points

- [BillingCatalogService](services/billing-catalog.service.ts) handles provider catalog work used by Plan provisioning.
- [BillingCheckoutService](services/billing-checkout.service.ts) creates subscription checkout sessions.
- [BillingPortalService](services/billing-portal.service.ts) creates customer portal sessions.
- [StripeWebhookService](services/stripe-webhook.service.ts) applies platform subscription events.
- [BillingRepository](repos/billing.repository.ts) persists billing data through the module's repository contract.

The webhook route is `POST /api/v1/webhooks/stripe`. It accepts provider callbacks without a user session and verifies the Stripe signature. Preserve raw request bodies for signature validation. Durable receipt and queue behavior are described in [payment infrastructure](../../infrastructure/payments/README.md).

Owner-facing operations are exposed by [Subscriptions](../subscriptions/README.md), and Plan administration by [Plans](../plans/README.md). Platform billing customers are separate from merchant Connect accounts and shopper purchase payments handled by [Payments](../payments/README.md) and [Orders](../orders/README.md).

Use the project's `stripe:listen` command for local platform webhook delivery, and configure its signing secret as `STRIPE_WEBHOOK_SECRET`.
