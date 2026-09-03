import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PublicProductsService } from '../services/public-products.service';

@ApiTags('Public Products')
@AllowAnonymous()
@Controller('stores/:storeSlug/products')
export class PublicProductsController {
  constructor(private readonly publicProductsService: PublicProductsService) {}

  @Get()
  listPublishedProducts(@Param('storeSlug') _storeSlug: string) {
    void _storeSlug;
    return;
  }

  @Get(':slug')
  getPublishedProduct(
    @Param('storeSlug') _storeSlug: string,
    @Param('slug') _slug: string,
  ) {
    void _storeSlug;
    void _slug;
    return;
  }
}
