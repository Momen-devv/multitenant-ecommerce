import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AddProductImageDto,
  ReorderProductImagesDto,
  UpdateProductImageDto,
} from '../dto';
import { ProductImagesService } from '../services/product-images.service';

@ApiTags('Product Images')
@Controller('products/:productId/images')
export class ProductImagesController {
  constructor(private readonly productImagesService: ProductImagesService) {}

  @Post()
  addImage(
    @Param('productId') _productId: string,
    @Body() _body: AddProductImageDto,
  ) {
    void _productId;
    void _body;
    return;
  }

  @Get()
  listImages(@Param('productId') _productId: string) {
    void _productId;
    return;
  }

  @Put('order')
  reorderImages(
    @Param('productId') _productId: string,
    @Body() _body: ReorderProductImagesDto,
  ) {
    void _productId;
    void _body;
    return;
  }

  @Patch(':imageId')
  updateImage(
    @Param('productId') _productId: string,
    @Param('imageId') _imageId: string,
    @Body() _body: UpdateProductImageDto,
  ) {
    void _productId;
    void _imageId;
    void _body;
    return;
  }

  @Delete(':imageId')
  deleteImage(
    @Param('productId') _productId: string,
    @Param('imageId') _imageId: string,
  ) {
    void _productId;
    void _imageId;
    return;
  }
}
