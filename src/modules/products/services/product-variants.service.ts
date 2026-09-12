import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryPolicy, ProductVariantStatus } from '@/common/enums';
import {
  StoreLifecycleConflictError,
  VariantConflictError,
} from '@/common/errors';
import type { ActiveStoreContext } from '@/common/guards/active-store.guard';
import {
  ArchiveProductVariantDto,
  CreateProductVariantDto,
  ReplaceVariantOptionValuesDto,
  UpdateProductInventoryDto,
  UpdateProductVariantDto,
} from '../dto';
import {
  ProductVariantsRepository,
  type CreateSimpleVariantInput,
} from '../repos/product-variants.repository';
import { generateVariantIdentifiers } from '../domain/variant-catalog';

@Injectable()
export class ProductVariantsService {
  constructor(
    private readonly productVariantsRepository: ProductVariantsRepository,
  ) {}

  async createVariant(
    productId: string,
    dto: CreateProductVariantDto,
    store: ActiveStoreContext,
  ) {
    const inventoryPolicy = this.validateCreateVariant(dto);
    const { sku, barcode } = generateVariantIdentifiers();
    const input: CreateSimpleVariantInput = {
      price: dto.price,
      compareAtPrice: dto.compareAtPrice ?? null,
      weightGrams: dto.weightGrams ?? null,
      sku,
      barcode,
      inventoryPolicy,
      onHand: inventoryPolicy === InventoryPolicy.TRACKED ? dto.onHand! : null,
      optionValueIds: dto.optionValueIds ?? [],
    };
    try {
      const variant = await this.productVariantsRepository.createVariant(
        store.storeId,
        productId,
        input,
      );
      if (!variant) throw new NotFoundException('Product not found');
      return variant;
    } catch (error) {
      if (error instanceof VariantConflictError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  async listVariants(
    productId: string,
    includeArchived: boolean,
    store: ActiveStoreContext,
  ) {
    if (
      !(await this.productVariantsRepository.productExists(
        store.storeId,
        productId,
      ))
    ) {
      throw new NotFoundException('Product not found');
    }
    return this.productVariantsRepository.findMany(
      store.storeId,
      productId,
      includeArchived,
    );
  }

  async getVariant(
    productId: string,
    variantId: string,
    store: ActiveStoreContext,
  ) {
    const row = await this.productVariantsRepository.findOne(
      store.storeId,
      productId,
      variantId,
    );
    if (!row) throw new NotFoundException('Variant not found');
    return row;
  }

  async getBarcode(
    productId: string,
    variantId: string,
    store: ActiveStoreContext,
  ) {
    const barcode = await this.productVariantsRepository.findBarcode(
      store.storeId,
      productId,
      variantId,
    );
    if (!barcode) throw new NotFoundException('Variant not found');
    return barcode;
  }

  async replaceOptionValues(
    productId: string,
    variantId: string,
    dto: ReplaceVariantOptionValuesDto,
    store: ActiveStoreContext,
  ) {
    try {
      const changed = await this.productVariantsRepository.replaceOptionValues(
        store.storeId,
        productId,
        variantId,
        dto,
      );
      if (!changed) throw new NotFoundException('Variant not found');
    } catch (error) {
      if (error instanceof VariantConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateProductVariantDto,
    store: ActiveStoreContext,
  ) {
    const { expectedVersion, ...input } = dto;
    const current = await this.productVariantsRepository.findOne(
      store.storeId,
      productId,
      variantId,
    );
    if (!current) throw new NotFoundException('Variant not found');
    const price = input.price ?? current.price;
    const compareAtPrice =
      input.compareAtPrice === undefined
        ? current.compareAtPrice
        : input.compareAtPrice;
    this.validateCompareAtPrice(price, compareAtPrice);
    try {
      const updated = await this.productVariantsRepository.update(
        store.storeId,
        productId,
        variantId,
        expectedVersion,
        input,
      );
      if (!updated)
        throw new ConflictException(
          'Variant was changed or archived by another request.',
        );
      return this.productVariantsRepository.findOne(
        store.storeId,
        productId,
        updated.id,
      );
    } catch (error) {
      if (error instanceof VariantConflictError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  async updateInventory(
    productId: string,
    variantId: string,
    dto: UpdateProductInventoryDto,
    store: ActiveStoreContext,
  ) {
    this.validateInventoryUpdate(dto);
    const { expectedVersion, ...input } = dto;
    const updated = await this.productVariantsRepository.updateInventory(
      store.storeId,
      productId,
      variantId,
      expectedVersion,
      input,
    );
    if (updated) return updated;

    const existing = await this.productVariantsRepository.findOne(
      store.storeId,
      productId,
      variantId,
    );
    if (!existing) throw new NotFoundException('Variant not found');
    throw new ConflictException(
      'Variant inventory was changed, archived, or is no longer compatible with this update.',
    );
  }

  async archiveVariant(
    productId: string,
    variantId: string,
    dto: ArchiveProductVariantDto,
    store: ActiveStoreContext,
  ) {
    try {
      const archived = await this.productVariantsRepository.archiveVariant(
        store.storeId,
        productId,
        variantId,
        dto.expectedVersion,
      );
      if (!archived) throw new NotFoundException('Variant not found');
      return archived;
    } catch (error) {
      if (error instanceof StoreLifecycleConflictError) {
        throw new ForbiddenException(
          'The Store is no longer active and cannot be modified.',
        );
      }
      if (error instanceof VariantConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private validateCreateVariant(dto: CreateProductVariantDto): InventoryPolicy {
    if (dto.status && dto.status !== ProductVariantStatus.ACTIVE) {
      throw new BadRequestException('A newly created Variant must be active.');
    }

    this.validateCompareAtPrice(dto.price, dto.compareAtPrice);

    const inventoryPolicy = dto.inventoryPolicy ?? InventoryPolicy.TRACKED;
    if (inventoryPolicy === InventoryPolicy.TRACKED && dto.onHand == null) {
      throw new BadRequestException(
        'onHand is required for tracked inventory.',
      );
    }
    if (inventoryPolicy === InventoryPolicy.UNTRACKED && dto.onHand != null) {
      throw new BadRequestException(
        'onHand must be omitted for untracked inventory.',
      );
    }

    return inventoryPolicy;
  }

  private validateCompareAtPrice(
    price: number,
    compareAtPrice: number | null | undefined,
  ) {
    if (compareAtPrice != null && compareAtPrice <= price) {
      throw new BadRequestException(
        'compareAtPrice must be greater than price.',
      );
    }
  }

  private validateInventoryUpdate(dto: UpdateProductInventoryDto) {
    if (
      dto.inventoryPolicy === InventoryPolicy.TRACKED &&
      dto.onHand === undefined
    ) {
      throw new BadRequestException(
        'onHand is required when setting tracked inventory.',
      );
    }
    if (
      dto.inventoryPolicy === InventoryPolicy.UNTRACKED &&
      dto.onHand !== undefined
    ) {
      throw new BadRequestException(
        'onHand must be omitted when setting untracked inventory.',
      );
    }
  }
}
