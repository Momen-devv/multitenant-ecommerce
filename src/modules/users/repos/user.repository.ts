import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { count, eq, sql } from 'drizzle-orm';
import type { User } from '@/infrastructure/database/schema/schema.types';
import { AuthRole } from '@/common/enums';
import type { IUserRepository } from '../interfaces/repos/user-repository.interface';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findById(userId: string): Promise<User | undefined> {
    const [result] = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    return result;
  }

  async countPlatformSuperAdmins(): Promise<number> {
    const [result] = await this.db
      .select({ value: count() })
      .from(schema.user)
      .where(
        sql`${AuthRole.PLATFORM_SUPER_ADMIN} = ANY(string_to_array(COALESCE(${schema.user.role}, ''), ','))`,
      );

    return result?.value ?? 0;
  }
}
