# Products

Products owns Store product management, variants, option graphs, inventory, image galleries, category assignments, and public storefront product reads.

## API surfaces

Staff management uses `/api/v1/products`, with nested `/:productId/variants`, `/options`, and `/images`. The `setup` route creates a product setup through the dedicated workflow. Public browsing uses `/api/v1/stores/:storeSlug/products` and `/:slug`.

Management controllers use the active Store guard and operation-specific permissions. Public controllers permit anonymous access; visibility filtering belongs in the public service and repository.

## Catalog invariants

[Catalog limits](domain/product-catalog-limits.ts) allow up to 20 categories per product, 3 options, 10 values per option, and 30 active variants. Subscription product limits are enforced separately. [Variant catalog helpers](domain/variant-catalog.ts) maintain the option/variant model.

Product, variant, option, and gallery writes have separate repository responsibilities. Preserve version and lifecycle checks when updating them. Inventory belongs to variants, which are also the items referenced by [Carts](../carts/README.md) and reserved by [Orders](../orders/README.md).

Public query allowlists live in [public-product.query.ts](queries/public-product.query.ts). [Public cache policy](cache/public-products.cache.ts) and [catalog invalidation](cache/catalog-cache.invalidator.ts) must stay consistent with mutations affecting product or category visibility. See [query conventions](../../common/api-query/README.md).

Image upload and cleanup use [storage infrastructure](../../infrastructure/storage/README.md). Keep gallery ordering and database changes coordinated with object cleanup rather than treating file deletion as a database-only operation.
