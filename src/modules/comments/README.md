# Comments

Comments owns public product comment lists, authenticated author writes, Store staff deletion, and AI moderation before publication.

Public reads use `GET /api/v1/stores/:storeSlug/products/:productSlug/comments`. Author create/update/delete routes use `/api/v1/products/:productId/comments`. Staff deletion uses `/api/v1/stores/me/products/:productId/comments/:commentId` with active Store context and controller permissions.

## Publication workflow

[CommentsService](services/comments.service.ts) requires a published product for creation and public listing. Creation uses an idempotency key and request hash: replay of the same request returns the stored response; reusing the key for different content conflicts.

Create and update call the typed [moderation questions](questions/comment-moderation.questions.ts). Only a `safe` decision permits publication. Provider failure returns service unavailable; other decisions are forbidden. Updating checks author ownership and the saved version to detect concurrent changes.

`CommentsRepository` handles public/author persistence, while `StoreCommentsRepository` handles Store-scoped deletion. Public list fields and filters are defined in [public-comment.query.ts](queries/public-comment.query.ts). AI credentials and provider behavior are documented in [AI infrastructure](../../infrastructure/ai/README.md).
