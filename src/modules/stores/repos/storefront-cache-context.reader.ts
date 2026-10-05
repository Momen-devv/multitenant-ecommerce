import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { StoreStatus } from '@/common/enums';
import { store } from '@/infrastructure/database/schema/app.schema';
import * as schema from '@/infrastructure/database/schema/schema';

@Injectable()
export class StorefrontCacheContextReader {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  // Eligibility is always resolved from PostgreSQL, never Redis.
  findActive(storeSlug: string) {
    return this.db.query.store.findFirst({
      columns: { id: true },
      where: and(
        eq(store.slug, storeSlug),
        eq(store.status, StoreStatus.ACTIVE),
      ),
    });
  }
}
