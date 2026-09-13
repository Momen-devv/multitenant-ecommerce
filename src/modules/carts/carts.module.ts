import { Module } from '@nestjs/common';
import { SecureTokenService } from '@/common/services/secure-token.service';
import { CARTS_REPOSITORY } from './interfaces/repos';
import { CartsRepository } from './repos';
import { CartsService } from './services/carts.service';
import { OrdersModule } from '@/modules/orders/orders.module';
import { CartsController } from './controllers/carts.controller';

@Module({
  imports: [OrdersModule],
  controllers: [CartsController],
  providers: [
    CartsService,
    CartsRepository,
    { provide: CARTS_REPOSITORY, useExisting: CartsRepository },
    SecureTokenService,
  ],
  exports: [CartsService],
})
export class CartsModule {}
