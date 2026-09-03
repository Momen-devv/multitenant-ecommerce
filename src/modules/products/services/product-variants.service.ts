import { Injectable } from '@nestjs/common';
import { ProductVariantsRepository } from '../repos/product-variants.repository';

@Injectable()
export class ProductVariantsService {
  constructor(
    private readonly productVariantsRepository: ProductVariantsRepository,
  ) {}
}
