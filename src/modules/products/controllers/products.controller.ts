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
  Query,
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
  ProductContentResponseDto,
  ProductListResponseDto,
  ProductResponseDto,
  UpdateProductDto,
  UpdateProductStatusDto,
} from '../dto';
import { ApiListQueryDto } from '@/common/api-query';

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
    model: ProductContentResponseDto,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid Product data')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Product slug already exists in this Store',
  )
  @ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    'Store is not active, the subscription is inactive, or the Product limit has been reached',
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

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({
    summary: 'List owner Products',
    description:
      'Returns a cursor-paginated catalog. Search matches names; status is filtered with filter[status][eq|ne|in]. Archived Products are excluded unless status is explicitly filtered.',
  })
  @ApiSuccessResponse({
    description: 'Products retrieved successfully',
    model: ProductListResponseDto,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid list query')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Store is not active')
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Store not found or you do not have a store',
  )
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ResponseMessage('Products retrieved successfully')
  @HttpCode(HttpStatus.OK)
  @Get()
  listProducts(
    @Query() query: ApiListQueryDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productsService.listProducts(query, store);
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

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({
    summary: 'Update mutable Product content',
    description:
      'Updates name and/or description. Slug and lifecycle fields are immutable.',
  })
  @ApiSuccessResponse({
    description: 'Product updated successfully',
    model: ProductContentResponseDto,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid Product ID or update data')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Product is archived')
  @ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    'Store is not active and cannot be modified',
  )
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Product not found')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ResponseMessage('Product updated successfully')
  @HttpCode(HttpStatus.OK)
  @Patch(':productId')
  updateProduct(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: UpdateProductDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productsService.updateProduct(productId, dto, store);
  }

  @Delete(':productId')
  archiveProduct(@Param('productId') _productId: string) {
    void _productId;
    return;
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({
    summary: 'Publish a complete Product or return it to draft',
    description:
      'Publishing validates the locked Product aggregate. Repeating its current status is idempotent.',
  })
  @ApiSuccessResponse({
    description: 'Product status updated successfully',
    model: ProductContentResponseDto,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid Product ID or status')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Product is archived, incomplete, or changed during publication',
  )
  @ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    'Store is not active and cannot be modified',
  )
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Product not found')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ResponseMessage('Product status updated successfully')
  @HttpCode(HttpStatus.OK)
  @Patch(':productId/status')
  updateProductStatus(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: UpdateProductStatusDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productsService.updateProductStatus(productId, dto, store);
  }
}
