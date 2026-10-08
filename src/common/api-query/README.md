# API query helpers

This package converts validated list inputs into Drizzle query fragments and cursor pages. It performs no database I/O. Feature `queries/` files define which fields a resource exposes and which sorting, filters, and search it supports.

## Client inputs

| Input    | Behavior                                                                   |
| -------- | -------------------------------------------------------------------------- |
| `limit`  | Integer from 1 to 100; default 20                                          |
| `cursor` | Opaque `pageInfo.nextCursor` from the previous response                    |
| `sort`   | Comma-separated fields; prefix a field with `-` for descending order       |
| `fields` | Comma-separated allowlisted response fields                                |
| `search` | Trimmed text from 2 to 100 characters, on configured searchable columns    |
| `filter` | Field/operator/value map; only resource-approved combinations are accepted |

Supported filter operators are `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, and `in`, subject to each definition. HTTP query encoding and exposed DTOs should be checked in the feature controller and Swagger schema.

Pages contain `items` and `pageInfo: { nextCursor, hasNextPage }`, inside the normal HTTP success envelope. Preserve the query arguments when requesting another page. Cursors are encoded boundaries, not authorization tokens; repository tenant and visibility conditions remain necessary.

## Repository integration

1. Define the resource with `defineApiQuery`, including visible columns, primary key, codecs, sorting, filters, and search columns.
2. Call `prepareApiQuery` or `compileApiQuery` before reading data, including before a cache lookup. Semantic validation must also run on cache hits.
3. Apply the compiled `where` alongside the repository's Store, ownership, and visibility conditions.
4. Select required `columns` and `extras`, use `orderBy`, and fetch `limit + 1` rows.
5. Call `createPage(rows)` to trim the extra row and generate the next cursor. An optional extension callback can attach additional response data.

The compiler appends the primary key as a final sort field when needed. It uses keyset pagination with nulls last. Hidden sort values are selected to build the cursor without exposing them in the requested projection. Cursor decoding verifies resource, sort, version, and value count; codecs validate values.

See [implementation](api-query.ts), [types](api-query.types.ts), [input limits](api-query.limits.ts), and a [public product query](../../modules/products/queries/public-product.query.ts) for a concrete definition.
