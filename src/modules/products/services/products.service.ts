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
import {
  CreateProductDto,
  ProductResponseDto,
  ProductVariantAssignmentResponseDto,
} from '../dto';
import type { Product } from '@/infrastructure/database/schema/schema.types';
import {
  PRODUCTS_REPOSITORY,
  type IProductsRepository,
  type ProductAggregate,
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
      return this.toResponse(product, store.currency);
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
    return this.toResponse(
      product,
      product.store?.defaultCurrency ?? store.currency,
    );
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

  private toResponse(
    product: Product | ProductAggregate,
    currency: string,
  ): ProductResponseDto {
    const aggregate = 'images' in product ? product : undefined;

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      status: product.status,
      currency,
      version: product.version,
      gallery:
        aggregate?.images.map((image) => ({
          id: image.id,
          imageKey: image.imageKey,
          publicUrl: image.publicUrl,
          altText: image.altText,
          width: image.width,
          height: image.height,
          mimeType: image.mimeType,
          byteSize: image.byteSize,
          position: image.position,
        })) ?? [],
      options:
        aggregate?.options.map((option) => ({
          id: option.id,
          name: option.name,
          position: option.position,
          values: option.values.map((value) => ({
            id: value.id,
            value: value.value,
            position: value.position,
          })),
        })) ?? [],
      variants:
        aggregate?.variants.map((variant) => ({
          id: variant.id,
          title: variant.title,
          sku: variant.sku,
          barcode: variant.barcode,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          weightGrams: variant.weightGrams,
          status: variant.status,
          inventoryPolicy: variant.inventoryPolicy,
          onHand: variant.onHand,
          reserved: variant.reserved,
          version: variant.version,
          assignments: variant.optionValues.map(
            (assignment): ProductVariantAssignmentResponseDto => ({
              optionId: assignment.optionId,
              optionValueId: assignment.optionValueId,
            }),
          ),
        })) ?? [],
    };
  }
}
