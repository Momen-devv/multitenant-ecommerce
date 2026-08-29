import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { store } from '@/infrastructure/database/schema/app.schema';
import { Store, NewStore } from '@/infrastructure/database/schema/schema.types';
import { and, eq } from 'drizzle-orm';
import { generateUUIDv7 } from '@/common/utils';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { SlugConflictError } from '@/common/errors/slug-conflict.error';
import { StoreLifecycleConflictError } from '@/common/errors/store-lifecycle-conflict.error';
import { organization } from '@/infrastructure/database/schema/auth.schema';
import { storeLifecycleAudit } from '@/infrastructure/database/schema/app.schema';
import type {
  StoreLifecycleActorAuthority,
  StoreStatus,
} from '../domain/store-status';
import { compileApiQuery, type ApiListQueryInput } from '@/common/api-query';
import { platformStoreQuery } from '../queries/platform-store.query';
import type { IStoreRepository } from '../interfaces/repos/store-repository.interface';

@Injectable()
export class StoreRepository implements IStoreRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(data: Omit<NewStore, 'id'>): Promise<Store> {
    try {
      const [created] = await this.db
        .insert(store)
        .values({
          id: generateUUIDv7(),
          organizationId: data.organizationId,
          ownerId: data.ownerId,
          name: data.name,
          slug: data.slug,
          description: data.description,
          status: 'active',
        })
        .returning();

      return created;
    } catch (error) {
      if (this.isUniqueViolation(error, 'store_slug_unique')) {
        throw new SlugConflictError();
      }

      throw error;
    }
  }

  async findByOwnerId(ownerId: string) {
    return this.db.query.store.findFirst({
      where: eq(store.ownerId, ownerId),
    });
  }

  async findPageWithOwner(input: ApiListQueryInput) {
    const query = compileApiQuery(platformStoreQuery, input);
    const rows = await this.db.query.store.findMany({
      columns: query.columns,
      where: query.where,
      orderBy: query.orderBy,
      limit: query.limit + 1,
      with: {
        owner: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return query.createPage(rows, (row) => ({
      owner: row.owner,
    }));
  }

  async findByIdWithOwner(storeId: string) {
    return this.db.query.store.findFirst({
      where: eq(store.id, storeId),
      with: {
        owner: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async findByOrganizationId(organizationId: string) {
    return this.db.query.store.findFirst({
      where: eq(store.organizationId, organizationId),
    });
  }

  async findBySlug(slug: string) {
    return this.db.query.store.findFirst({
      where: eq(store.slug, slug),
    });
  }

  async update(id: string, data: Partial<Store>) {
    const [updated] = await this.db
      .update(store)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(store.id, id))
      .returning();

    return updated;
  }

  async updateActiveStore(id: string, data: Partial<Store>) {
    const [updated] = await this.db
      .update(store)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(store.id, id), eq(store.status, 'active')))
      .returning();

    if (!updated) {
      throw new StoreLifecycleConflictError(
        'The Store is no longer active and cannot be modified.',
      );
    }

    return updated;
  }

  async transitionStatus(input: {
    storeId: string;
    actorId: string;
    actorAuthority: StoreLifecycleActorAuthority;
    previousStatus: StoreStatus;
    newStatus: StoreStatus;
    reason: string;
  }): Promise<Store> {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(store)
        .set({ status: input.newStatus, updatedAt: new Date() })
        .where(
          and(
            eq(store.id, input.storeId),
            eq(store.status, input.previousStatus),
          ),
        )
        .returning();

      if (!updated) {
        throw new StoreLifecycleConflictError();
      }

      await tx.insert(storeLifecycleAudit).values({
        id: generateUUIDv7(),
        storeId: input.storeId,
        actorId: input.actorId,
        actorAuthority: input.actorAuthority,
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        reason: input.reason,
      });

      return updated;
    });
  }

  async deleteOrganization(organizationId: string) {
    await this.db
      .delete(organization)
      .where(eq(organization.id, organizationId))
      .returning();
  }

  async updateOrganizationName(organizationId: string, name: string) {
    await this.db
      .update(organization)
      .set({ name })
      .where(eq(organization.id, organizationId))
      .returning();
  }
  private isUniqueViolation(err: unknown, constraintName?: string): boolean {
    if (!(err instanceof DrizzleQueryError)) return false;
    if (!(err.cause instanceof DatabaseError)) return false;
    if (err.cause.code !== '23505') return false;

    return constraintName ? err.cause.constraint === constraintName : true;
  }
}
