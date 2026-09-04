import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import slugify from 'slugify';
import type { ActiveStoreContext } from '@/common/guards/active-store.guard';
import { SlugConflictError } from '@/common/errors/slug-conflict.error';
import { CreateProductDto, UpdateProductDto } from '../dto';
import type { ApiListQueryInput } from '@/common/api-query';
import {
  PRODUCTS_REPOSITORY,
  type IProductsRepository,
} from '../interfaces/repos';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCTS_REPOSITORY)
    private readonly productsRepository: IProductsRepository,
  ) {}

  async createProduct(dto: CreateProductDto, store: ActiveStoreContext) {
    const slug = dto.slug ?? this.generateSlug(dto.name);

    try {
      const product = await this.productsRepository.create(store.storeId, {
        name: dto.name,
        slug,
        description: dto.description ?? null,
      });
      return product;
    } catch (err) {
      if (err instanceof SlugConflictError) {
        throw new ConflictException(this.buildSlugConflictMessage(dto));
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

  private generateSlug(name: string) {
    const slug = slugify(name, { lower: true, strict: true, trim: true });

    if (!slug) {
      throw new BadRequestException(
        'Product name must contain at least one letter or number.',
      );
    }

    return slug;
  }

  private buildSlugConflictMessage(dto: CreateProductDto): string {
    return dto.slug
      ? `The slug "${dto.slug}" is already taken. Please choose a different slug.`
      : `A product named "${dto.name}" already exists. Please choose a different name or a custom slug.`;
  }
}
