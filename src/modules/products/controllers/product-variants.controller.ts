import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CreateProductVariantDto,
  UpdateProductInventoryDto,
  UpdateProductVariantDto,
} from '../dto';
import { ProductVariantsService } from '../services/product-variants.service';

@ApiTags('Product Variants')
@Controller('products/:productId/variants')
export class ProductVariantsController {
  constructor(
    private readonly productVariantsService: ProductVariantsService,
  ) {}

  @Post()
  createVariant(
    @Param('productId') _productId: string,
    @Body() _body: CreateProductVariantDto,
  ) {
    void _productId;
    void _body;
    return;
  }

  @Get()
  listVariants(@Param('productId') _productId: string) {
    void _productId;
    return;
  }

  @Get(':variantId')
  getVariant(
    @Param('productId') _productId: string,
    @Param('variantId') _variantId: string,
  ) {
    void _productId;
    void _variantId;
    return;
  }

  @Patch(':variantId')
  updateVariant(
    @Param('productId') _productId: string,
    @Param('variantId') _variantId: string,
    @Body() _body: UpdateProductVariantDto,
  ) {
    void _productId;
    void _variantId;
    void _body;
    return;
  }

  @Patch(':variantId/inventory')
  updateInventory(
    @Param('productId') _productId: string,
    @Param('variantId') _variantId: string,
    @Body() _body: UpdateProductInventoryDto,
  ) {
    void _productId;
    void _variantId;
    void _body;
    return;
  }

  @Delete(':variantId')
  archiveVariant(
    @Param('productId') _productId: string,
    @Param('variantId') _variantId: string,
  ) {
    void _productId;
    void _variantId;
    return;
  }
}
