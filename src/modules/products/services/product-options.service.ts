import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OptionGraphConflictError } from '@/common/errors';
import type { ActiveStoreContext } from '@/common/guards/active-store.guard';
import type {
  CreateProductOptionDto,
  CreateProductOptionValueDto,
  ReorderProductOptionValuesDto,
  UpdateProductOptionDto,
  UpdateProductOptionValueDto,
} from '../dto';
import { ProductOptionsRepository } from '../repos/product-options.repository';

@Injectable()
export class ProductOptionsService {
  constructor(
    private readonly productOptionsRepository: ProductOptionsRepository,
  ) {}

  async getOptions(productId: string, store: ActiveStoreContext) {
    const graph = await this.productOptionsRepository.findGraph(
      store.storeId,
      productId,
    );
    if (!graph) throw new NotFoundException('Product not found');
    return graph;
  }

  async createOption(
    productId: string,
    dto: CreateProductOptionDto,
    store: ActiveStoreContext,
  ) {
    try {
      const option = await this.productOptionsRepository.createOption(
        store.storeId,
        productId,
        dto,
      );
      if (!option) throw new NotFoundException('Product not found');
      return option;
    } catch (error) {
      if (error instanceof OptionGraphConflictError) {
        throw new ConflictException(
          'Product option configuration conflicts with the current product state.',
        );
      }
      throw error;
    }
  }

  async updateOption(
    productId: string,
    optionId: string,
    dto: UpdateProductOptionDto,
    store: ActiveStoreContext,
  ) {
    try {
      const changed = await this.productOptionsRepository.updateOption(
        store.storeId,
        productId,
        optionId,
        dto,
      );
      if (!changed) throw new NotFoundException('Option not found');
    } catch (error) {
      if (error instanceof OptionGraphConflictError) {
        throw new ConflictException(
          'Product option configuration conflicts with the current product state.',
        );
      }
      throw error;
    }
  }

  async deleteOption(
    productId: string,
    optionId: string,
    store: ActiveStoreContext,
  ) {
    try {
      const deleted = await this.productOptionsRepository.deleteOption(
        store.storeId,
        productId,
        optionId,
      );
      if (!deleted) throw new NotFoundException('Option not found');
    } catch (error) {
      if (error instanceof OptionGraphConflictError) {
        throw new ConflictException(
          'Product option configuration conflicts with the current product state.',
        );
      }
      throw error;
    }
  }

  async createValue(
    productId: string,
    optionId: string,
    dto: CreateProductOptionValueDto,
    store: ActiveStoreContext,
  ) {
    try {
      const value = await this.productOptionsRepository.createValue(
        store.storeId,
        productId,
        optionId,
        dto,
      );
      if (!value) throw new NotFoundException('Option not found');
      return value;
    } catch (error) {
      if (error instanceof OptionGraphConflictError) {
        throw new ConflictException(
          'Product option configuration conflicts with the current product state.',
        );
      }
      throw error;
    }
  }

  async updateValue(
    productId: string,
    optionId: string,
    valueId: string,
    dto: UpdateProductOptionValueDto,
    store: ActiveStoreContext,
  ) {
    try {
      const changed = await this.productOptionsRepository.updateValue(
        store.storeId,
        productId,
        optionId,
        valueId,
        dto,
      );
      if (!changed) throw new NotFoundException('Option value not found');
    } catch (error) {
      if (error instanceof OptionGraphConflictError) {
        throw new ConflictException(
          'Product option configuration conflicts with the current product state.',
        );
      }
      throw error;
    }
  }

  async deleteValue(
    productId: string,
    optionId: string,
    valueId: string,
    store: ActiveStoreContext,
  ) {
    try {
      const deleted = await this.productOptionsRepository.deleteValue(
        store.storeId,
        productId,
        optionId,
        valueId,
      );
      if (!deleted) throw new NotFoundException('Option value not found');
    } catch (error) {
      if (error instanceof OptionGraphConflictError) {
        throw new ConflictException(
          'Product option configuration conflicts with the current product state.',
        );
      }
      throw error;
    }
  }

  async reorderValues(
    productId: string,
    optionId: string,
    dto: ReorderProductOptionValuesDto,
    store: ActiveStoreContext,
  ) {
    try {
      const reordered = await this.productOptionsRepository.reorderValues(
        store.storeId,
        productId,
        optionId,
        dto,
      );
      if (!reordered) throw new NotFoundException('Option not found');
    } catch (error) {
      if (error instanceof OptionGraphConflictError) {
        throw new ConflictException(
          'Product option configuration conflicts with the current product state.',
        );
      }
      throw error;
    }
  }
}
