import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import slugify from 'slugify';
import { SlugConflictError } from '@/common/errors/slug-conflict.error';
import { CreateProductDto } from '../dto';
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

  async createProduct(dto: CreateProductDto, storeId: string) {
    const slug = dto.slug ?? this.generateSlug(dto.name);

    try {
      const product = await this.productsRepository.create(storeId, {
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

  async getProduct(productId: string, storeId: string) {
    const product = await this.productsRepository.findOne(storeId, productId);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private generateSlug(name: string) {
    return slugify(name, { lower: true, strict: true, trim: true });
  }

  private buildSlugConflictMessage(dto: CreateProductDto): string {
    return dto.slug
      ? `The slug "${dto.slug}" is already taken. Please choose a different slug.`
      : `A product named "${dto.name}" already exists. Please choose a different name or a custom slug.`;
  }
}
