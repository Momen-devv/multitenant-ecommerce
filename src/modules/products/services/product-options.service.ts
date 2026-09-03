import { Injectable } from '@nestjs/common';
import { ProductOptionsRepository } from '../repos/product-options.repository';

@Injectable()
export class ProductOptionsService {
  constructor(
    private readonly productOptionsRepository: ProductOptionsRepository,
  ) {}
}
