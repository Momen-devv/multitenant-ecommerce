import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import * as schema from '@/infrastructure/database/schema/schema';
import { store } from '@/infrastructure/database/schema/app.schema';
import { Store, NewStore } from '@/infrastructure/database/schema/schema.types';
import { eq } from 'drizzle-orm';
import { generateUUIDv7 } from '@/common/utils';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { SlugConflictError } from '@/common/errors/slug-conflict.error';
import { organization } from '@/infrastructure/database/schema/auth.schema';

@Injectable()
export class StoreRepository {
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

  async deactivateStore(id: string) {
    await this.db
      .update(store)
      .set({
        isActive: false,
        deactivatedAt: new Date(),
      })
      .where(eq(store.id, id))
      .returning();
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
