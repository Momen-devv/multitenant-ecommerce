import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { StorageService } from '@/common/abstracts/storage.abstracts';
import { ProductImageGalleryConflictError } from '@/common/errors';
import type { ActiveStoreContext } from '@/common/guards/active-store.guard';
import { ImageProcessingService } from '@/common/services/Image-processing.service';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { ResourceCleanupQueueService } from '@/infrastructure/queue/resource-cleanup/resource-cleanup-queue.service';
import {
  AddProductImageDto,
  BulkDeleteProductImagesDto,
  ReorderProductImagesDto,
  UpdateProductImageDto,
} from '../dto';
import { ProductImagesRepository } from '../repos/product-images.repository';

@Injectable()
export class ProductImagesService {
  constructor(
    private readonly productImagesRepository: ProductImagesRepository,
    private readonly storage: StorageService,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly resourceCleanupQueue: ResourceCleanupQueueService,
    private readonly logger: LoggerService,
  ) {}

  async addImage(
    productId: string,
    image: Express.Multer.File,
    dto: AddProductImageDto,
    store: ActiveStoreContext,
  ) {
    try {
      if (
        !(await this.productImagesRepository.assertProductMutable(
          store.storeId,
          productId,
        ))
      ) {
        throw new NotFoundException('Product not found');
      }
    } catch (error) {
      if (error instanceof ProductImageGalleryConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    const processedImage = await this.processImage(image);
    const imageKey = this.createImageKey(
      store.storeId,
      productId,
      processedImage.image.mimetype,
    );
    const publicUrl = await this.storage.uploadFile(
      processedImage.image,
      imageKey,
    );
    try {
      const created = await this.productImagesRepository.create(
        store.storeId,
        productId,
        {
          imageKey,
          publicUrl,
          altText: dto.altText ?? null,
          width: processedImage.width,
          height: processedImage.height,
          mimeType: processedImage.image.mimetype,
          byteSize: processedImage.image.size,
        },
      );
      if (!created) throw new NotFoundException('Product not found');
      return created;
    } catch (error) {
      this.logger.error(
        'Failed to persist product image after upload',
        error,
        ProductImagesService.name,
      );
      await this.resourceCleanupQueue
        .addDeleteOrphanedFileJob(imageKey)
        .catch((enqueueError) =>
          this.logger.error(
            `Failed to enqueue orphaned file cleanup for "${imageKey}"`,
            enqueueError,
            ProductImagesService.name,
          ),
        );
      if (error instanceof ProductImageGalleryConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  async addImages(
    productId: string,
    images: Express.Multer.File[],
    store: ActiveStoreContext,
  ) {
    if (!images?.length) {
      throw new UnprocessableEntityException('At least one image is required.');
    }

    try {
      if (
        !(await this.productImagesRepository.assertProductMutable(
          store.storeId,
          productId,
        ))
      ) {
        throw new NotFoundException('Product not found');
      }
    } catch (error) {
      if (error instanceof ProductImageGalleryConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    const processedImages = await Promise.all(
      images.map((image) => this.processImage(image)),
    );
    const uploaded: Array<{
      imageKey: string;
      publicUrl: string;
      processedImage: (typeof processedImages)[number];
    }> = [];

    try {
      for (const processedImage of processedImages) {
        const imageKey = this.createImageKey(
          store.storeId,
          productId,
          processedImage.image.mimetype,
        );
        const publicUrl = await this.storage.uploadFile(
          processedImage.image,
          imageKey,
        );
        uploaded.push({ imageKey, publicUrl, processedImage });
      }

      const created = await this.productImagesRepository.createMany(
        store.storeId,
        productId,
        uploaded.map(({ imageKey, publicUrl, processedImage }) => ({
          imageKey,
          publicUrl,
          altText: null,
          width: processedImage.width,
          height: processedImage.height,
          mimeType: processedImage.image.mimetype,
          byteSize: processedImage.image.size,
        })),
      );
      if (!created) throw new NotFoundException('Product not found');
      return created;
    } catch (error) {
      await this.queueOrphanedFileCleanup(
        uploaded.map(({ imageKey }) => imageKey),
      );
      if (error instanceof ProductImageGalleryConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  async listImages(productId: string, store: ActiveStoreContext) {
    if (
      !(await this.productImagesRepository.productExists(
        store.storeId,
        productId,
      ))
    ) {
      throw new NotFoundException('Product not found');
    }
    return this.productImagesRepository.findMany(store.storeId, productId);
  }

  async updateImage(
    productId: string,
    imageId: string,
    dto: UpdateProductImageDto,
    store: ActiveStoreContext,
  ) {
    try {
      const changed = await this.productImagesRepository.updateAltText(
        store.storeId,
        productId,
        imageId,
        dto.altText,
      );
      if (!changed) throw new NotFoundException('Product image not found');
    } catch (error) {
      if (error instanceof ProductImageGalleryConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  async reorderImages(
    productId: string,
    dto: ReorderProductImagesDto,
    store: ActiveStoreContext,
  ) {
    try {
      const reordered = await this.productImagesRepository.reorder(
        store.storeId,
        productId,
        dto.imageIds,
      );
      if (!reordered) throw new NotFoundException('Product not found');
    } catch (error) {
      if (error instanceof ProductImageGalleryConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  async deleteImage(
    productId: string,
    imageId: string,
    store: ActiveStoreContext,
  ) {
    try {
      const deleted = await this.productImagesRepository.delete(
        store.storeId,
        productId,
        imageId,
      );
      if (!deleted) throw new NotFoundException('Product image not found');
      await this.resourceCleanupQueue
        .addDeleteOldFileJob(deleted.imageKey)
        .catch((enqueueError) =>
          this.logger.error(
            `Failed to enqueue deleted product image cleanup for "${deleted.imageKey}"`,
            enqueueError,
            ProductImagesService.name,
          ),
        );
    } catch (error) {
      if (error instanceof ProductImageGalleryConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  async deleteImages(
    productId: string,
    dto: BulkDeleteProductImagesDto,
    store: ActiveStoreContext,
  ) {
    try {
      const deleted = await this.productImagesRepository.deleteMany(
        store.storeId,
        productId,
        dto.imageIds,
      );
      if (!deleted) {
        throw new NotFoundException('Product image not found');
      }

      await Promise.all(
        deleted.imageKeys.map((imageKey) =>
          this.resourceCleanupQueue
            .addDeleteOldFileJob(imageKey)
            .catch((enqueueError) =>
              this.logger.error(
                `Failed to enqueue deleted product image cleanup for "${imageKey}"`,
                enqueueError,
                ProductImagesService.name,
              ),
            ),
        ),
      );
    } catch (error) {
      if (error instanceof ProductImageGalleryConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private async readDimensions(image: Express.Multer.File) {
    try {
      const metadata = await sharp(image.buffer).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error('Image dimensions are unavailable.');
      }
      return { width: metadata.width, height: metadata.height };
    } catch {
      throw new UnprocessableEntityException(
        'Invalid image file. The file may be corrupted or not a valid image.',
      );
    }
  }

  private async processImage(image: Express.Multer.File) {
    try {
      const sanitizedImage =
        await this.imageProcessingService.validateAndSanitize(image);
      const { width, height } = await this.readDimensions(sanitizedImage);
      return { image: sanitizedImage, width, height };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }
  }

  private createImageKey(storeId: string, productId: string, mimeType: string) {
    return `product-images/${storeId}/${productId}/${randomUUID()}.${mimeType.split('/')[1]}`;
  }

  private async queueOrphanedFileCleanup(imageKeys: string[]) {
    await Promise.all(
      imageKeys.map((imageKey) =>
        this.resourceCleanupQueue
          .addDeleteOrphanedFileJob(imageKey)
          .catch((enqueueError) =>
            this.logger.error(
              `Failed to enqueue orphaned file cleanup for "${imageKey}"`,
              enqueueError,
              ProductImagesService.name,
            ),
          ),
      ),
    );
  }
}
