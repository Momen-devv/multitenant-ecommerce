import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { storeCheckoutSettings } from '@/infrastructure/database/schema/schema';
import type { StoreCheckoutSettings } from '@/infrastructure/database/schema/schema.types';

export type CheckoutSettingsWrite = Pick<
  StoreCheckoutSettings,
  | 'shippingFee'
  | 'deliveryCountries'
  | 'shippingPolicy'
  | 'cashOnDeliveryEnabled'
  | 'onlineEnabled'
>;

const MAX_SAFE_VERSION = Number.MAX_SAFE_INTEGER;

@Injectable()
export class StoreCheckoutSettingsRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  findSettings(storeId: string): Promise<StoreCheckoutSettings | undefined> {
    return this.db.query.storeCheckoutSettings.findFirst({
      where: eq(storeCheckoutSettings.storeId, storeId),
    });
  }

  async insertInitial(
    storeId: string,
    input: CheckoutSettingsWrite,
  ): Promise<StoreCheckoutSettings | undefined> {
    const [created] = await this.db
      .insert(storeCheckoutSettings)
      .values({ storeId, version: 1, ...input })
      .onConflictDoNothing({ target: storeCheckoutSettings.storeId })
      .returning();
    return created;
  }

  async updateAtVersion(
    storeId: string,
    version: number,
    input: CheckoutSettingsWrite,
  ): Promise<StoreCheckoutSettings | undefined> {
    const [updated] = await this.db
      .update(storeCheckoutSettings)
      .set({ ...input, version: version + 1, updatedAt: new Date() })
      .where(
        and(
          eq(storeCheckoutSettings.storeId, storeId),
          eq(storeCheckoutSettings.version, version),
          // Do not create an unsafe response version at the numeric boundary.
          lt(storeCheckoutSettings.version, MAX_SAFE_VERSION),
        ),
      )
      .returning();
    return updated;
  }
}
