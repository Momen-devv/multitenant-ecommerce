# Payment infrastructure

`PaymentInfrastructureModule` supplies the shared Stripe client, `PAYMENT_GATEWAY` adapter, payment event repository, and Connect webhook queue. Feature modules own billing, Store Payment Accounts, checkout, and order rules.

## Providers

- `STRIPE_CLIENT`: shared Stripe SDK client exported through `StripeModule`.
- `PAYMENT_GATEWAY`: `StripePaymentGateway`, implementing `PaymentGateway` for connected accounts, onboarding links, checkout sessions, payment retrieval, and refunds.
- `PaymentEventsRepository`: durable Connect event receipts and processing state.
- `ConnectWebhookQueueModule`: event dispatch and recovery.

The client pins its API version in [stripe.module.ts](stripe/stripe.module.ts). Keep provider-specific operations behind the gateway where the feature uses that abstraction.

## Configuration

| Variable                                | Purpose                                               |
| --------------------------------------- | ----------------------------------------------------- |
| `STRIPE_SECRET_KEY`                     | Stripe sandbox API key                                |
| `STRIPE_WEBHOOK_SECRET`                 | Platform billing webhook signing secret               |
| `STRIPE_CONNECT_WEBHOOK_SECRET`         | Connected-account webhook signing secret              |
| `STRIPE_CONNECT_SANDBOX_MODE`           | Must be `true` for the current shopper payment flow   |
| `STRIPE_CONNECT_ONBOARDING_RETURN_URL`  | Destination after onboarding                          |
| `STRIPE_CONNECT_ONBOARDING_REFRESH_URL` | Destination when the onboarding link needs refreshing |
| `STRIPE_CHECKOUT_SUCCESS_URL`           | Shopper checkout success destination                  |
| `STRIPE_CHECKOUT_CANCEL_URL`            | Shopper checkout cancellation destination             |
| `STRIPE_TIMEOUT_MS`                     | SDK request timeout in milliseconds                   |
| `STRIPE_MAX_NETWORK_RETRIES`            | SDK network retry count                               |

All values are validated by the application configuration. A Store's platform Billing Customer and connected Store Payment Account serve separate payment flows.

## Webhooks

- `POST /api/v1/webhooks/stripe`: platform billing events.
- `POST /api/v1/webhooks/stripe-connect`: connected-account events.

Webhook requests need the original raw JSON body and `stripe-signature` header. These endpoints bypass session and CSRF checks and authenticate the signature instead. Connect receipts are persisted before acknowledgment; processing is delegated to queued handlers and durable recovery.

For local development, run `npm run stripe:listen` and `npm run stripe:listen:connect` from the project root in separate terminals. Set each listener's signing secret in its matching environment variable and restart the API.

Mutating gateway methods that accept idempotency keys must receive stable keys from the owning feature. Queue retries alone do not protect payment side effects from duplication.
