import { Module } from '@nestjs/common';
import { SecureTokenService } from '@/common/services/secure-token.service';
import { CARTS_REPOSITORY } from './interfaces/repos';
import { CartsRepository } from './repos';
import { CartsService } from './services/carts.service';

@Module({
  providers: [
    CartsService,
    CartsRepository,
    { provide: CARTS_REPOSITORY, useExisting: CartsRepository },
    SecureTokenService,
  ],
  exports: [CartsService],
})
export class CartsModule {}
