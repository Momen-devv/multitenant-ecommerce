import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import type { CurrentUser } from '@/core/auth/auth.types';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { member, store } from '@/infrastructure/database/schema/schema';
import type { ActiveStoreContext } from './active-store.guard';

export type StoreMembershipRequest = {
  session?: CurrentUser;
  activeStore?: ActiveStoreContext;
};

@Injectable()
export class StoreMembershipGuard implements CanActivate {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<StoreMembershipRequest>();
    const userId = request.session?.user.id;
    const organizationId = request.session?.session.activeOrganizationId;
    if (!userId || !organizationId) {
      throw new ForbiddenException('An active organization is required.');
    }

    const [result] = await this.db
      .select({
        organizationId: store.organizationId,
        storeId: store.id,
        currency: store.defaultCurrency,
      })
      .from(store)
      .innerJoin(
        member,
        and(
          eq(member.organizationId, store.organizationId),
          eq(member.userId, userId),
        ),
      )
      .where(eq(store.organizationId, organizationId))
      .limit(1);

    if (!result) {
      throw new NotFoundException(
        'Store not found for the active organization.',
      );
    }

    request.activeStore = result;
    return true;
  }
}
