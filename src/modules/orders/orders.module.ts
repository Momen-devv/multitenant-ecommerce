import { Module } from '@nestjs/common';
import { OrdersRepository } from './repos';
import { StoresModule } from '@/modules/stores/stores.module';
import { OrdersController } from './controllers/orders.controller';
import { OrderStoreGuard } from '@/common/guards/order-store.guard';

@Module({
  imports: [StoresModule],
  controllers: [OrdersController],
  providers: [OrdersRepository, OrderStoreGuard],
  exports: [OrdersRepository],
})
export class OrdersModule {}
