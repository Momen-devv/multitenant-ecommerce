export interface IStoreCommentsRepository {
  delete(
    commentId: string,
    productId: string,
    storeId: string,
  ): Promise<{ id: string } | undefined>;
}
