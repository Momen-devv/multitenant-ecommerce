import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import endpointCacheConfig from '@/core/config/endpoint-cache.config';
import { CatalogCacheInvalidator } from './cache/catalog-cache.invalidator';
import { PUBLIC_PRODUCT_LIST_READER } from './interfaces/public-product-list-reader.interface';
import { StoresModule } from '../stores/stores.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PRODUCTS_REPOSITORY } from './interfaces/repos';
import { ProductImagesController } from './controllers/product-images.controller';
import { ProductOptionsController } from './controllers/product-options.controller';
import { ProductVariantsController } from './controllers/product-variants.controller';
import { ProductsController } from './controllers/products.controller';
import { PublicProductsController } from './controllers/public-products.controller';
import {
  ProductImagesRepository,
  ProductOptionsRepository,
  ProductVariantsRepository,
  ProductsRepository,
  PublicProductsRepository,
} from './repos';
import { ProductImagesService } from './services/product-images.service';
import { ProductOptionsService } from './services/product-options.service';
import { ProductVariantsService } from './services/product-variants.service';
import { ProductsService } from './services/products.service';
import { PublicProductsService } from './services/public-products.service';
import { ActiveStoreGuard } from '@/common/guards/active-store.guard';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { ResourceCleanupQueueModule } from '@/infrastructure/queue/resource-cleanup/resource-cleanup-queue.module';
import { ImageProcessingService } from '@/common/services/Image-processing.service';

@Module({
  controllers: [
    ProductsController,
    ProductVariantsController,
    ProductOptionsController,
    ProductImagesController,
    PublicProductsController,
  ],
  imports: [
    ConfigModule.forFeature(endpointCacheConfig),
    StoresModule,
    SubscriptionsModule,
    StorageModule,
    ResourceCleanupQueueModule,
  ],
  providers: [
    CatalogCacheInvalidator,
    { provide: PUBLIC_PRODUCT_LIST_READER, useExisting: PublicProductsService },
    ProductsService,
    ProductsRepository,
    { provide: PRODUCTS_REPOSITORY, useExisting: ProductsRepository },
    ProductVariantsService,
    ProductVariantsRepository,
    ProductOptionsService,
    ProductOptionsRepository,
    ProductImagesService,
    ProductImagesRepository,
    PublicProductsService,
    PublicProductsRepository,
    ActiveStoreGuard,
    ImageProcessingService,
  ],
  exports: [
    PublicProductsRepository,
    PUBLIC_PRODUCT_LIST_READER,
    CatalogCacheInvalidator,
  ],
})
export class ProductsModule {}
