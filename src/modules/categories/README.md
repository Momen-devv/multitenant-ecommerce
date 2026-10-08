# Categories

Categories owns Store category creation, metadata, lifecycle, ordering, product membership reads, and public category browsing.

Staff routes use `/api/v1/categories`, including `reorder`, `/:categoryId/status`, and archive through the delete route. They require active Store context and feature permissions. Public routes use `/api/v1/stores/:storeSlug/categories`, `/:categorySlug`, and `/:categorySlug/products`.

## Implementation and consistency

`CategoriesService` and its repository handle management; `PublicCategoriesService` and its repository handle storefront visibility. `queries/` defines owner/public list contracts. [CategoryMembershipReader](repos/category-membership.reader.ts) supports category validation by product workflows.

Lifecycle, version, and reorder conflicts have dedicated shared errors. Keep concurrency checks when changing ordering or publication state. Product-category assignment mutations belong to [Products](../products/README.md).

[Public category caching](cache/public-categories.cache.ts) shares catalog invalidation concerns with Products. A category change can affect product browsing as well as category lists; review the [catalog invalidator](../products/cache/catalog-cache.invalidator.ts) when adding a mutation.
