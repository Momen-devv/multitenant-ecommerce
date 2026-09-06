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
import { PublicProductListResponseDto } from '../dto';
import { PublicProductsService } from '../services/public-products.service';

@ApiTags('Public Products')
@AllowAnonymous()
@Controller('stores/:storeSlug/products')
export class PublicProductsController {
  constructor(private readonly publicProductsService: PublicProductsService) {}

  @ApiOperation({
    summary: 'Browse published Products for an active Store',
    description:
      'Supports cursor pagination, name search, and sorting by createdAt, updatedAt, or name.',
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
