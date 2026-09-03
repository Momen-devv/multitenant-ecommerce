import { Injectable } from '@nestjs/common';
import { PublicProductsRepository } from '../repos/public-products.repository';

@Injectable()
export class PublicProductsService {
  constructor(
    private readonly publicProductsRepository: PublicProductsRepository,
  ) {}
}
