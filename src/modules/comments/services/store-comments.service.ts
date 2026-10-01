import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  STORE_COMMENTS_REPOSITORY,
  type IStoreCommentsRepository,
} from '../interfaces/repos';

@Injectable()
export class StoreCommentsService {
  constructor(
    @Inject(STORE_COMMENTS_REPOSITORY)
    private readonly repository: IStoreCommentsRepository,
  ) {}

  async delete(productId: string, commentId: string, storeId: string) {
    if (!(await this.repository.delete(commentId, productId, storeId))) {
      throw new NotFoundException('Comment not found.');
    }
  }
}
