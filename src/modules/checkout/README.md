# Checkout eligibility

`CheckoutModule` provides shared Store eligibility through `CHECKOUT_ELIGIBILITY_READER`. It has no checkout controller. Shopper quote and purchase endpoints live in [Orders](../orders/README.md).

[CheckoutEligibilityService](services/checkout-eligibility.service.ts) reads Store identity, current subscription, and merchant payment readiness in parallel and returns:

| Field                | Meaning                                                |
| -------------------- | ------------------------------------------------------ |
| `storeExists`        | The Store was found                                    |
| `canAcceptOrders`    | Store is active and subscription is active or trialing |
| `onlinePaymentReady` | Merchant payment readiness reported by Payments        |

A missing Store returns all three values as false. Online payment readiness and general order acceptance are separate results; callers must apply the checks required by the selected payment method. This reader does not validate a Cart, address, price, or inventory and does not reserve stock.

See [reader contract and tokens](interfaces/index.ts), [Stores](../stores/README.md), [Subscriptions](../subscriptions/README.md), and [Payments](../payments/README.md).
