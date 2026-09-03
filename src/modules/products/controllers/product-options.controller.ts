import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReplaceProductOptionsDto } from '../dto';
import { ProductOptionsService } from '../services/product-options.service';

@ApiTags('Product Options')
@Controller('products/:productId/options')
export class ProductOptionsController {
  constructor(private readonly productOptionsService: ProductOptionsService) {}

  @Get()
  getOptions(@Param('productId') _productId: string) {
    void _productId;
    return;
  }

  @Put()
  replaceOptions(
    @Param('productId') _productId: string,
    @Body() _body: ReplaceProductOptionsDto,
  ) {
    void _productId;
    void _body;
    return;
  }
}
