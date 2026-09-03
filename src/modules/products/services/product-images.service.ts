import { Injectable } from '@nestjs/common';
import { ProductImagesRepository } from '../repos/product-images.repository';

@Injectable()
export class ProductImagesService {
  constructor(
    private readonly productImagesRepository: ProductImagesRepository,
  ) {}
}
