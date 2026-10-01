import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { productComments } from '@/infrastructure/database/schema/schema';
import type { IStoreCommentsRepository } from '../interfaces/repos';

@Injectable()
export class StoreCommentsRepository implements IStoreCommentsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async delete(commentId: string, productId: string, storeId: string) {
    const [row] = await this.db
      .delete(productComments)
      .where(
        and(
          eq(productComments.id, commentId),
          eq(productComments.productId, productId),
          eq(productComments.storeId, storeId),
        ),
      )
      .returning({ id: productComments.id });
    return row;
  }
}
