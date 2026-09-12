import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ActiveStoreContext } from '@/common/guards/active-store.guard';
import { createCatalogSlug } from '@/common/utils';
import {
  CategoryLifecycleConflictError,
  CategoryLimitExceededError,
  CategoryReorderConflictError,
  CategoryVersionConflictError,
  SlugConflictError,
  StoreLifecycleConflictError,
} from '@/common/errors';
import type { ApiListQueryInput } from '@/common/api-query';
import {
  SUBSCRIPTIONS_REPOSITORY,
  type ISubscriptionsRepository,
} from '@/modules/subscriptions/interfaces/repos';
import { resolvePlanLimit } from '@/modules/subscriptions/domain/plan-limit';
import {
  CATEGORIES_REPOSITORY,
  type ICategoriesRepository,
} from '../interfaces/repos';
import type {
  ArchiveCategoryDto,
  CreateCategoryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from '../dto';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(CATEGORIES_REPOSITORY)
    private readonly categoriesRepository: ICategoriesRepository,
    @Inject(SUBSCRIPTIONS_REPOSITORY)
    private readonly subscriptionsRepository: ISubscriptionsRepository,
  ) {}

  async createCategory(
    dto: CreateCategoryDto,
    activeStore: ActiveStoreContext,
  ) {
    const limit = await this.getCategoryLimit(activeStore.storeId);
    try {
      return await this.categoriesRepository.create(
        activeStore.storeId,
        {
          name: dto.name,
          slug: dto.slug ?? this.generateSlug(dto.name),
          description: dto.description ?? null,
        },
        limit,
      );
    } catch (error) {
      this.translateWriteError(error, dto);
    }
  }

  async getCategory(categoryId: string, activeStore: ActiveStoreContext) {
    const category = await this.categoriesRepository.findOne(
      activeStore.storeId,
      categoryId,
    );
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  listCategories(query: ApiListQueryInput, activeStore: ActiveStoreContext) {
    return this.categoriesRepository.findPage(activeStore.storeId, query);
  }

  async updateCategory(
    categoryId: string,
    dto: UpdateCategoryDto,
    activeStore: ActiveStoreContext,
  ) {
    const { expectedVersion, ...input } = dto;
    try {
      const category = await this.categoriesRepository.update(
        activeStore.storeId,
        categoryId,
        input,
        expectedVersion,
      );
      if (!category) throw new NotFoundException('Category not found');
      return category;
    } catch (error) {
      this.translateWriteError(error, dto);
    }
  }

  async updateCategoryStatus(
    categoryId: string,
    dto: UpdateCategoryStatusDto,
    activeStore: ActiveStoreContext,
  ) {
    try {
      const category = await this.categoriesRepository.transitionStatus(
        activeStore.storeId,
        categoryId,
        dto.status,
        dto.expectedVersion,
      );
      if (!category) throw new NotFoundException('Category not found');
      return category;
    } catch (error) {
      this.translateWriteError(error);
    }
  }

  async archiveCategory(
    categoryId: string,
    dto: ArchiveCategoryDto,
    activeStore: ActiveStoreContext,
  ) {
    try {
      const category = await this.categoriesRepository.archive(
        activeStore.storeId,
        categoryId,
        dto.expectedVersion,
      );
      if (!category) throw new NotFoundException('Category not found');
      return category;
    } catch (error) {
      this.translateWriteError(error);
    }
  }

  async reorderCategories(
    dto: ReorderCategoriesDto,
    activeStore: ActiveStoreContext,
  ) {
    try {
      return await this.categoriesRepository.reorder(
        activeStore.storeId,
        dto.categories,
      );
    } catch (error) {
      this.translateWriteError(error);
    }
  }

  private async getCategoryLimit(storeId: string) {
    const resolution = resolvePlanLimit(
      await this.subscriptionsRepository.findCurrentPlanEntitlementByStoreId(
        storeId,
      ),
      'categories',
    );
    if (resolution.kind === 'subscription-required') {
      throw new ForbiddenException(
        'An active or trial subscription is required to create Categories.',
      );
    }
    if (resolution.kind === 'limit-missing') {
      throw new ForbiddenException(
        'Your plan does not include a Category limit.',
      );
    }
    return resolution.limit;
  }

  private generateSlug(name: string) {
    const slug = createCatalogSlug(name);
    if (!slug) {
      throw new BadRequestException(
        'Category name must contain at least one letter or number.',
      );
    }
    return slug;
  }

  private translateWriteError(
    error: unknown,
    dto?: { name?: string; slug?: string | null },
  ): never {
    if (error instanceof SlugConflictError) {
      throw new ConflictException(
        dto?.slug
          ? `The slug "${dto.slug}" is already taken. Please choose a different slug.`
          : `A Category named "${dto?.name}" already generates an occupied slug. Please provide a custom slug.`,
      );
    }
    if (error instanceof CategoryLimitExceededError) {
      throw new ForbiddenException(
        `Your plan allows ${error.limit} Categories; you currently have ${error.usage}. Archive Categories or upgrade your plan to create another.`,
      );
    }
    if (error instanceof StoreLifecycleConflictError) {
      throw new ForbiddenException(
        'The Store is no longer active and cannot be modified.',
      );
    }
    if (
      error instanceof CategoryVersionConflictError ||
      error instanceof CategoryLifecycleConflictError ||
      error instanceof CategoryReorderConflictError
    ) {
      throw new ConflictException(error.message);
    }
    throw error;
  }
}
