import { Module } from '@nestjs/common';
import { OrdersRepository } from './repos';

@Module({
  providers: [OrdersRepository],
  exports: [OrdersRepository],
})
export class OrdersModule {}
