import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { user } from '@/infrastructure/database/schema/auth.schema';

@Injectable()
export class UserRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findImageByUserId(userId: string): Promise<string | null> {
    const [foundUser] = await this.db
      .select({ image: user.imageKey })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return foundUser?.image ?? null;
  }

  async updateUserName(userId: string, name: string): Promise<boolean> {
    const updatedUsers = await this.db
      .update(user)
      .set({ name })
      .where(eq(user.id, userId))
      .returning({ id: user.id });

    return updatedUsers.length > 0;
  }

  async updateUserImage(
    userId: string,
    imageUrl: string,
    imageKey: string,
  ): Promise<boolean> {
    const updatedUsers = await this.db
      .update(user)
      .set({ image: imageUrl, imageKey: imageKey })
      .where(eq(user.id, userId))
      .returning({ id: user.id });

    return updatedUsers.length > 0;
  }
}
