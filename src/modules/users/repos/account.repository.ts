import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { eq } from 'drizzle-orm';
import { User } from '@/infrastructure/database/schema/schema.types';

@Injectable()
export class AccountRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findByEmail(email: string): Promise<Partial<User> | undefined> {
    const [result] = await this.db
      .select({ isActive: schema.user.isActive, id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1);

    return result;
  }

  async updateUser(userId: string, data: Partial<User>): Promise<void> {
    await this.db
      .update(schema.user)
      .set(data)
      .where(eq(schema.user.id, userId))
      .execute();
  }
}
