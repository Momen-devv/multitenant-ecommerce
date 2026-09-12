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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
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
import { ApiListQueryDto } from '@/common/api-query';
import {
  ArchiveCategoryDto,
  CategoryListResponseDto,
  CategoryResponseDto,
  CreateCategoryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from '../dto';
import { CategoriesService } from '../services/categories.service';

@ApiTags('Categories')
@ApiCookieAuth('mte.session_token')
@UseGuards(ActiveStoreGuard)
@OrgRoles([OrganizationRole.OWNER])
@Controller('categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Create a draft Category' })
  @ApiSuccessResponse({
    status: HttpStatus.CREATED,
    description: 'Category created successfully',
    model: CategoryResponseDto,
  })
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Category slug already exists')
  @ResponseMessage('Category created successfully')
  create(
    @Body() dto: CreateCategoryDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.service.createCategory(dto, store);
  }

  @Get()
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiSuccessResponse({
    description: 'Categories retrieved successfully',
    model: CategoryListResponseDto,
  })
  @ResponseMessage('Categories retrieved successfully')
  list(
    @Query() query: ApiListQueryDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.service.listCategories(query, store);
  }

  @Put('reorder')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'Atomically replace the non-archived Category order',
  })
  @ResponseMessage('Categories reordered successfully')
  reorder(
    @Body() dto: ReorderCategoriesDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.service.reorderCategories(dto, store);
  }

  @Get(':categoryId')
  @ApiSuccessResponse({
    description: 'Category retrieved successfully',
    model: CategoryResponseDto,
  })
  @ResponseMessage('Category retrieved successfully')
  get(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.service.getCategory(categoryId, store);
  }

  @Patch(':categoryId')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiSuccessResponse({
    description: 'Category updated successfully',
    model: CategoryResponseDto,
  })
  @ResponseMessage('Category updated successfully')
  update(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateCategoryDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.service.updateCategory(categoryId, dto, store);
  }

  @Patch(':categoryId/status')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiSuccessResponse({
    description: 'Category status updated successfully',
    model: CategoryResponseDto,
  })
  @ResponseMessage('Category status updated successfully')
  updateStatus(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateCategoryStatusDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.service.updateCategoryStatus(categoryId, dto, store);
  }

  @Delete(':categoryId')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiSuccessResponse({
    description: 'Category archived successfully',
    model: CategoryResponseDto,
  })
  @ResponseMessage('Category archived successfully')
  archive(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: ArchiveCategoryDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.service.archiveCategory(categoryId, dto, store);
  }
}
