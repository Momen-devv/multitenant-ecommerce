import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import type { IAssistantRepository } from '../interfaces/repos/assistant-repository.interface';

@Injectable()
export class AssistantRepository implements IAssistantRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findUserIdByEmail(email: string): Promise<string | undefined> {
    const [user] = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email.toLowerCase()))
      .limit(1);

    return user?.id;
  }

  async findMemberIdByEmail(
    organizationId: string,
    email: string,
  ): Promise<string | undefined> {
    const [member] = await this.db
      .select({ id: schema.member.id })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
      .where(
        and(
          eq(schema.member.organizationId, organizationId),
          eq(schema.user.email, email.toLowerCase()),
        ),
      )
      .limit(1);

    return member?.id;
  }

  async findInvitationIdByEmail(
    organizationId: string,
    email: string,
  ): Promise<string | undefined> {
    const [invitation] = await this.db
      .select({ id: schema.invitation.id })
      .from(schema.invitation)
      .where(
        and(
          eq(schema.invitation.organizationId, organizationId),
          eq(schema.invitation.email, email.toLowerCase()),
          eq(schema.invitation.status, 'pending'),
        ),
      )
      .limit(1);

    return invitation?.id;
  }
}
