import { Module } from '@nestjs/common';
import { CartsController } from './controllers/carts.controller';
import { CART_ACTIVE_CHECKOUT_READER, CARTS_REPOSITORY } from './interfaces';
import { CartsRepository } from './repos/carts.repository';
import { CartsService } from './services/carts.service';
import { EmptyActiveCheckoutReader } from './services/empty-active-checkout.reader';

@Module({
  controllers: [CartsController],
  providers: [
    CartsService,
    CartsRepository,
    { provide: CARTS_REPOSITORY, useExisting: CartsRepository },
    EmptyActiveCheckoutReader,
    {
      provide: CART_ACTIVE_CHECKOUT_READER,
      useExisting: EmptyActiveCheckoutReader,
    },
  ],
  exports: [CART_ACTIVE_CHECKOUT_READER, CARTS_REPOSITORY],
})
export class CartsModule {}
