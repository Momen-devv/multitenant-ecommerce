import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import slugify from 'slugify';
import { SubscriptionStatus } from '@/common/enums';
import type { ActiveStoreContext } from '@/common/guards/active-store.guard';
import { SlugConflictError } from '@/common/errors/slug-conflict.error';
import { ProductLimitExceededError } from '@/common/errors/product-limit-exceeded.error';
import {
  ProductLifecycleConflictError,
  StoreLifecycleConflictError,
} from '@/common/errors';
import {
  CreateProductDto,
  UpdateProductDto,
  UpdateProductStatusDto,
} from '../dto';
import type { ApiListQueryInput } from '@/common/api-query';
import {
  PRODUCTS_REPOSITORY,
  type IProductsRepository,
} from '../interfaces/repos';
import {
  SUBSCRIPTIONS_REPOSITORY,
  type ISubscriptionsRepository,
} from '@/modules/subscriptions/interfaces/repos';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCTS_REPOSITORY)
    private readonly productsRepository: IProductsRepository,
    @Inject(SUBSCRIPTIONS_REPOSITORY)
    private readonly subscriptionsRepository: ISubscriptionsRepository,
  ) {}

  async createProduct(dto: CreateProductDto, store: ActiveStoreContext) {
    const productLimit = await this.getProductLimit(store.storeId);
    const slug = dto.slug ?? this.generateSlug(dto.name);

    try {
      const product = await this.productsRepository.create(
        store.storeId,
        { name: dto.name, slug, description: dto.description ?? null },
        productLimit,
      );
      return product;
    } catch (err) {
      if (err instanceof SlugConflictError) {
        throw new ConflictException(this.buildSlugConflictMessage(dto));
      }
      if (err instanceof ProductLimitExceededError) {
        throw new ForbiddenException(
          `Your plan allows ${err.limit} Products; you currently have ${err.usage}. Archive Products or upgrade your plan to create another.`,
        );
      }
      throw err;
    }
  }

  async getProduct(productId: string, store: ActiveStoreContext) {
    const product = await this.productsRepository.findOne(
      store.storeId,
      productId,
    );
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async listProducts(query: ApiListQueryInput, store: ActiveStoreContext) {
    return this.productsRepository.findPage(store.storeId, query);
  }

  async updateProduct(
    productId: string,
    dto: UpdateProductDto,
    store: ActiveStoreContext,
  ) {
    const product = await this.productsRepository.update(
      store.storeId,
      productId,
      dto,
    );
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async updateProductStatus(
    productId: string,
    dto: UpdateProductStatusDto,
    store: ActiveStoreContext,
  ) {
    try {
      const product = await this.productsRepository.transitionStatus(
        store.storeId,
        productId,
        dto.status,
      );
      if (!product) throw new NotFoundException('Product not found');
      return product;
    } catch (error) {
      if (error instanceof StoreLifecycleConflictError) {
        throw new ForbiddenException(
          'The Store is no longer active and cannot be modified.',
        );
      }
      if (error instanceof ProductLifecycleConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private generateSlug(name: string) {
    const slug = slugify(name, { lower: true, strict: true, trim: true });

    if (!slug) {
      throw new BadRequestException(
        'Product name must contain at least one letter or number.',
      );
    }

    return slug;
  }

  private async getProductLimit(storeId: string): Promise<number> {
    const subscription =
      await this.subscriptionsRepository.findCurrentPlanEntitlementByStoreId(
        storeId,
      );
    if (
      subscription?.status !== SubscriptionStatus.ACTIVE &&
      subscription?.status !== SubscriptionStatus.TRIALING
    ) {
      throw new ForbiddenException(
        'An active or trial subscription is required to create Products.',
      );
    }
    const productLimit = subscription.plan.limits.products;
    if (typeof productLimit !== 'number') {
      throw new ForbiddenException(
        'Your plan does not include a Product limit.',
      );
    }
    return productLimit;
  }

  private buildSlugConflictMessage(dto: CreateProductDto): string {
    return dto.slug
      ? `The slug "${dto.slug}" is already taken. Please choose a different slug.`
      : `A product named "${dto.name}" already exists. Please choose a different name or a custom slug.`;
  }
}
