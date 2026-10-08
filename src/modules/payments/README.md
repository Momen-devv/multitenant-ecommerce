# Store payments

Payments owns Store merchant account onboarding, connection state, provider refresh, and recovery of account creation. It uses [payment infrastructure](../../infrastructure/payments/README.md) for Stripe access.

| Endpoint                                     | Purpose                              |
| -------------------------------------------- | ------------------------------------ |
| `GET /api/v1/stores/me/payments/connection`  | Inspect current merchant connection  |
| `POST /api/v1/stores/me/payments/onboarding` | Start or continue Connect onboarding |
| `POST /api/v1/stores/me/payments/refresh`    | Refresh connection state from Stripe |

The controller resolves Store membership and applies operation permissions. [StorePaymentsService](services/store-payments.service.ts) coordinates provider calls with [account persistence](repos/store-payment-accounts.repository.ts), processes account updates/deauthorization, and exposes `STORE_PAYMENT_READINESS_READER` to checkout eligibility.

Account creation has a recovery task in [store-payment-creation-recovery.task.ts](tasks/store-payment-creation-recovery.task.ts). Preserve its persisted request identity and recovery state when changing onboarding; retries must resolve the existing operation.

The current flow requires `STRIPE_CONNECT_SANDBOX_MODE=true`. Configure Connect onboarding return/refresh URLs and `STRIPE_CONNECT_WEBHOOK_SECRET`; local Connect webhook forwarding uses `npm run stripe:listen:connect`.

Merchant account readiness allows online purchase checkout, but the purchase attempt, Order, and refund workflows belong to [Orders](../orders/README.md). Platform subscription customers belong to [Billing](../billing/README.md).
