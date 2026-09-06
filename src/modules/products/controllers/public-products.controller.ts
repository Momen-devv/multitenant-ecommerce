import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiListQueryDto } from '@/common/api-query';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
} from '@/common/decorators';
import { ParseSlugPipe } from '@/common/pipes/parse-slug.pipe';
import { PublicProductListResponseDto, PublicProductResponseDto } from '../dto';
import { PublicProductsService } from '../services/public-products.service';

@ApiTags('Public Products')
@AllowAnonymous()
@Controller('stores/:storeSlug/products')
export class PublicProductsController {
  constructor(private readonly publicProductsService: PublicProductsService) {}

  @ApiOperation({
    summary: 'Browse published Products for an active Store',
    description:
      'Each Product includes its first ordered gallery image. Supports cursor pagination, name search, and sorting by createdAt, updatedAt, or name.',
  })
  @ApiParam({ name: 'storeSlug', example: 'acme-store' })
  @ApiSuccessResponse({
    description: 'Published Products retrieved successfully',
    model: PublicProductListResponseDto,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid Store slug or list query')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Store not found')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ResponseMessage('Published Products retrieved successfully')
  @HttpCode(HttpStatus.OK)
  @Get()
  listPublishedProducts(
    @Param('storeSlug', ParseSlugPipe) storeSlug: string,
    @Query() query: ApiListQueryDto,
  ) {
    return this.publicProductsService.listPublishedProducts(storeSlug, query);
  }

  @ApiOperation({
    summary: 'Get a published Product by slug',
    description:
      'Returns the storefront Product aggregate for an active Store. Missing, inactive, draft, and archived resources are all reported as not found.',
  })
  @ApiParam({ name: 'storeSlug', example: 'acme-store' })
  @ApiParam({ name: 'slug', example: 'classic-tee' })
  @ApiSuccessResponse({
    description: 'Published Product retrieved successfully',
    model: PublicProductResponseDto,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid Store or Product slug')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Published Product not found')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ResponseMessage('Published Product retrieved successfully')
  @HttpCode(HttpStatus.OK)
  @Get(':slug')
  getPublishedProduct(
    @Param('storeSlug', ParseSlugPipe) storeSlug: string,
    @Param('slug', ParseSlugPipe) slug: string,
  ) {
    return this.publicProductsService.getPublishedProduct(storeSlug, slug);
  }
}
