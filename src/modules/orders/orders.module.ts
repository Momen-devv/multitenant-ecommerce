import { Module } from '@nestjs/common';
import { CheckoutController } from './controllers/checkout.controller';
import { UserOrdersController } from './controllers/user-orders.controller';
import { CheckoutRepository } from './repos/checkout.repository';
import { OrdersRepository } from './repos/orders.repository';
import { OrdersService } from './services/orders.service';
import { CHECKOUT_REPOSITORY, ORDERS_REPOSITORY } from './interfaces';
@Module({
  controllers: [CheckoutController, UserOrdersController],
  providers: [
    OrdersService,
    CheckoutRepository,
    OrdersRepository,
    { provide: CHECKOUT_REPOSITORY, useExisting: CheckoutRepository },
    { provide: ORDERS_REPOSITORY, useExisting: OrdersRepository },
  ],
  exports: [OrdersService, CHECKOUT_REPOSITORY, ORDERS_REPOSITORY],
})
export class OrdersModule {}
