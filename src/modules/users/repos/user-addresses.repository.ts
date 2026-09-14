import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { userAddresses } from '@/infrastructure/database/schema/app.schema';
import type {
  CreateUserAddressInput,
  IUserAddressesRepository,
  UpdateUserAddressInput,
} from '../interfaces/repos';
import {
  MAX_USER_ADDRESSES,
  UserAddressLimitExceededError,
} from '../domain/user-address-limits';

@Injectable()
export class UserAddressesRepository implements IUserAddressesRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(userId: string, input: CreateUserAddressInput) {
    return this.db.transaction(async (tx) => {
      await this.lockUserAddresses(tx, userId);
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(userAddresses)
        .where(eq(userAddresses.userId, userId));
      if (count >= MAX_USER_ADDRESSES) {
        throw new UserAddressLimitExceededError(MAX_USER_ADDRESSES);
      }
      const isDefault = count === 0 || input.isDefault === true;

      if (isDefault) await this.clearDefault(tx, userId);

      const [address] = await tx
        .insert(userAddresses)
        .values({ ...input, userId, isDefault })
        .returning();
      return address;
    });
  }

  findAll(userId: string) {
    return this.db
      .select()
      .from(userAddresses)
      .where(eq(userAddresses.userId, userId))
      .orderBy(
        sql`${userAddresses.isDefault} DESC`,
        asc(userAddresses.createdAt),
      );
  }

  async update(
    userId: string,
    addressId: string,
    input: UpdateUserAddressInput,
  ) {
    const [address] = await this.db
      .update(userAddresses)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId)),
      )
      .returning();
    return address;
  }

  async delete(userId: string, addressId: string) {
    return this.db.transaction(async (tx) => {
      await this.lockUserAddresses(tx, userId);
      const [deleted] = await tx
        .delete(userAddresses)
        .where(
          and(
            eq(userAddresses.id, addressId),
            eq(userAddresses.userId, userId),
          ),
        )
        .returning({ isDefault: userAddresses.isDefault });
      if (!deleted) return false;

      if (deleted.isDefault) {
        const [nextDefault] = await tx
          .select({ id: userAddresses.id })
          .from(userAddresses)
          .where(eq(userAddresses.userId, userId))
          .orderBy(asc(userAddresses.createdAt))
          .limit(1);
        if (nextDefault) {
          await tx
            .update(userAddresses)
            .set({ isDefault: true, updatedAt: new Date() })
            .where(eq(userAddresses.id, nextDefault.id));
        }
      }
      return true;
    });
  }

  async setDefault(userId: string, addressId: string) {
    return this.db.transaction(async (tx) => {
      await this.lockUserAddresses(tx, userId);
      const [address] = await tx
        .select({ id: userAddresses.id })
        .from(userAddresses)
        .where(
          and(
            eq(userAddresses.id, addressId),
            eq(userAddresses.userId, userId),
          ),
        )
        .limit(1);
      if (!address) return undefined;

      await this.clearDefault(tx, userId);
      const [updated] = await tx
        .update(userAddresses)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(userAddresses.id, address.id))
        .returning();
      return updated;
    });
  }

  private async clearDefault(
    tx: Parameters<Parameters<typeof this.db.transaction>[0]>[0],
    userId: string,
  ) {
    await tx
      .update(userAddresses)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(userAddresses.userId, userId),
          eq(userAddresses.isDefault, true),
        ),
      );
  }

  private async lockUserAddresses(
    tx: Parameters<Parameters<typeof this.db.transaction>[0]>[0],
    userId: string,
  ) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${userId} || ':addresses'))`,
    );
  }
}
