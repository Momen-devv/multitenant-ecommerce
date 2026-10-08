# Carts

Carts owns shopper carts scoped to individual Stores and variant quantities. Checkout and Order placement belong to [Orders](../orders/README.md).

## HTTP workflow

1. Read `GET /api/v1/stores/:storeId/cart` or list carts at `GET /api/v1/users/me/carts`.
2. Use `PUT /api/v1/stores/:storeId/cart/items/:variantId` to set an item's quantity with the current Cart version.
3. Delete an item or clear the Cart through the corresponding delete route, supplying the version required by the DTO.
4. Read the updated Cart and use its version when requesting an Order quote.

The repository enforces version checks and Store/variant validity. A Cart is mutable shopping state; it is not a purchase snapshot or proof of available stock. Inspect returned checkout information before presenting editing actions during an active purchase attempt.

[Cart limits](domain/cart-limits.ts): 20 nonempty carts per user, 50 distinct items per Cart, and quantities from 1 to 99.

[CartsService](services/carts.service.ts) combines repository results with the injected `CART_ACTIVE_CHECKOUT_READER`. [CartsModule](carts.module.ts) currently binds it to `EmptyActiveCheckoutReader`, which returns no active checkout. Use the Orders attempt endpoints to inspect real purchase state. [CartCleanupTask](tasks/cart-cleanup.task.ts) maintains old Cart state when scheduling is enabled.
