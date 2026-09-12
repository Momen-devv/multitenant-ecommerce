import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { seconds, Throttle } from '@nestjs/throttler';
import { ApiListQueryDto } from '@/common/api-query';
import { ApiSuccessResponse, ResponseMessage } from '@/common/decorators';
import { ParseSlugPipe } from '@/common/pipes/parse-slug.pipe';
import {
  PublicCategoryListResponseDto,
  PublicCategoryResponseDto,
} from '../dto';
import { PublicProductListResponseDto } from '@/modules/products/dto';
import { PublicCategoriesService } from '../services/public-categories.service';

@ApiTags('Public Categories')
@AllowAnonymous()
@Throttle({ default: { limit: 60, ttl: seconds(60) } })
@Controller('stores/:storeSlug/categories')
export class PublicCategoriesController {
  constructor(private readonly service: PublicCategoriesService) {}

  @Get()
  @ApiParam({ name: 'storeSlug' })
  @ApiSuccessResponse({
    description: 'Published Categories retrieved successfully',
    model: PublicCategoryListResponseDto,
  })
  @ResponseMessage('Published Categories retrieved successfully')
  list(@Param('storeSlug', ParseSlugPipe) storeSlug: string) {
    return this.service.listCategories(storeSlug);
  }

  @Get(':categorySlug')
  @ApiSuccessResponse({
    description: 'Published Category retrieved successfully',
    model: PublicCategoryResponseDto,
  })
  @ResponseMessage('Published Category retrieved successfully')
  get(
    @Param('storeSlug', ParseSlugPipe) storeSlug: string,
    @Param('categorySlug', ParseSlugPipe) categorySlug: string,
  ) {
    return this.service.getCategory(storeSlug, categorySlug);
  }

  @Get(':categorySlug/products')
  @ApiOperation({ summary: 'Browse published Products in a Category' })
  @ApiSuccessResponse({
    description: 'Published Category Products retrieved successfully',
    model: PublicProductListResponseDto,
  })
  @ResponseMessage('Published Category Products retrieved successfully')
  products(
    @Param('storeSlug', ParseSlugPipe) storeSlug: string,
    @Param('categorySlug', ParseSlugPipe) categorySlug: string,
    @Query() query: ApiListQueryDto,
  ) {
    return this.service.listCategoryProducts(storeSlug, categorySlug, query);
  }
}
