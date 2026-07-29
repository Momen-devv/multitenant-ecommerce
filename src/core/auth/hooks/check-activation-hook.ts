import { DatabaseHook, BeforeCreate } from '@thallesp/nestjs-better-auth';
import { APIError } from 'better-auth/api';
import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import { DATABASE } from '@/common/constants/injection-tokens.constants';

interface Session {
  userId: string;
}

@DatabaseHook()
@Injectable()
export class CheckActivationHook {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  @BeforeCreate('session')
  async checkActivation(session: Session): Promise<void> {
    const [user] = await this.db
      .select({ isActive: schema.user.isActive })
      .from(schema.user)
      .where(eq(schema.user.id, session.userId))
      .limit(1);

    if (!user || !user.isActive) {
      throw new APIError('FORBIDDEN', {
        message:
          'Account is deactivated. Please activate your account or contact support.',
      });
    }
  }
}
