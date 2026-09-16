import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { checkoutAttempts } from '@/infrastructure/database/schema/orders.schema';
import type { ActiveCheckoutResponseDto } from '../dto';
import type { ICartActiveCheckoutReader } from './carts.service';

@Injectable()
export class EmptyActiveCheckoutReader implements ICartActiveCheckoutReader {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getActiveCheckout(
    cartId: string,
  ): Promise<ActiveCheckoutResponseDto | null> {
    const [attempt] = await this.db
      .select({
        attemptId: checkoutAttempts.id,
        status: checkoutAttempts.status,
        expiresAt: checkoutAttempts.expiresAt,
      })
      .from(checkoutAttempts)
      .where(
        and(
          eq(checkoutAttempts.cartId, cartId),
          inArray(checkoutAttempts.status, [
            'creating',
            'pending',
            'cancelling',
          ]),
        ),
      )
      .limit(1);
    return attempt?.expiresAt
      ? {
          attemptId: attempt.attemptId,
          status: attempt.status,
          expiresAt: attempt.expiresAt,
        }
      : null;
  }
}
