import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgRoles } from '@thallesp/nestjs-better-auth';
import { OrganizationRole } from '@/common/enums';
import {
  ActiveStore,
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
} from '@/common/decorators';
import {
  ActiveStoreGuard,
  type ActiveStoreContext,
} from '@/common/guards/active-store.guard';
import { ProductsService } from '../services/products.service';
import {
  CreateProductDto,
  ProductResponseDto,
  UpdateProductDto,
  UpdateProductStatusDto,
} from '../dto';

@ApiTags('Products')
@ApiCookieAuth('mte.session_token')
@UseGuards(ActiveStoreGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Create a draft Product' })
  @ApiSuccessResponse({
    status: HttpStatus.CREATED,
    description: 'Product created successfully',
    model: ProductResponseDto,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid Product data')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Product slug already exists in this Store',
  )
  @ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    'Store is not active and cannot be modified',
  )
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Store not found or you do not have a store',
  )
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ResponseMessage('Product created successfully')
  @HttpCode(HttpStatus.CREATED)
  @Post()
  createProduct(
    @Body() dto: CreateProductDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productsService.createProduct(dto, store);
  }

  @Get()
  listProducts() {
    return;
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Get an owner Product aggregate' })
  @ApiSuccessResponse({
    description: 'Product retrieved successfully',
    model: ProductResponseDto,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid Product ID')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Product not found')
  @ResponseMessage('Product retrieved successfully')
  @HttpCode(HttpStatus.OK)
  @Get(':productId')
  getProduct(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productsService.getProduct(productId, store);
  }

  @Patch(':productId')
  updateProduct(
    @Param('productId') _productId: string,
    @Body() _body: UpdateProductDto,
  ) {
    void _productId;
    void _body;
    return;
  }

  @Delete(':productId')
  archiveProduct(@Param('productId') _productId: string) {
    void _productId;
    return;
  }

  @Patch(':productId/status')
  updateProductStatus(
    @Param('productId') _productId: string,
    @Body() _body: UpdateProductStatusDto,
  ) {
    void _productId;
    void _body;
    return;
  }
}
