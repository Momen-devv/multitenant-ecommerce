import { Module } from '@nestjs/common';
import { ActiveStoreGuard } from '@/common/guards/active-store.guard';
import { StoresModule } from '@/modules/stores/stores.module';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';
import { ProductsModule } from '@/modules/products/products.module';
import { CATEGORIES_REPOSITORY } from './interfaces/repos';
import { CategoriesController } from './controllers/categories.controller';
import { PublicCategoriesController } from './controllers/public-categories.controller';
import { CategoriesRepository, PublicCategoriesRepository } from './repos';
import { CategoriesService } from './services/categories.service';
import { PublicCategoriesService } from './services/public-categories.service';

@Module({
  imports: [StoresModule, SubscriptionsModule, ProductsModule],
  controllers: [CategoriesController, PublicCategoriesController],
  providers: [
    CategoriesService,
    CategoriesRepository,
    { provide: CATEGORIES_REPOSITORY, useExisting: CategoriesRepository },
    PublicCategoriesService,
    PublicCategoriesRepository,
    ActiveStoreGuard,
  ],
})
export class CategoriesModule {}
