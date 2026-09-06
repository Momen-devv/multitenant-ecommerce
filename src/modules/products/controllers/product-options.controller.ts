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
import {
  CreateProductOptionDto,
  CreateProductOptionValueDto,
  ReorderProductOptionValuesDto,
  UpdateProductOptionDto,
  UpdateProductOptionValueDto,
} from '../dto';
import { ProductOptionsService } from '../services/product-options.service';

@ApiTags('Product Options')
@ApiCookieAuth('mte.session_token')
@UseGuards(ActiveStoreGuard)
@Controller('products/:productId/options')
export class ProductOptionsController {
  constructor(private readonly productOptionsService: ProductOptionsService) {}

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({
    summary: 'Get a Product option graph and Variant assignments',
  })
  @ApiSuccessResponse({ description: 'Product options retrieved successfully' })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Product not found')
  @ResponseMessage('Product options retrieved successfully')
  @Get()
  getOptions(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productOptionsService.getOptions(productId, store);
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Add an option to a draft Product' })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Product is not draft or name conflicts',
  )
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post()
  createOption(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: CreateProductOptionDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productOptionsService.createOption(productId, dto, store);
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Rename an option on a draft Product' })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Product is not draft or name conflicts',
  )
  @ResponseMessage('Product option updated successfully')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch(':optionId')
  updateOption(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('optionId', new ParseUUIDPipe()) optionId: string,
    @Body() dto: UpdateProductOptionDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productOptionsService.updateOption(
      productId,
      optionId,
      dto,
      store,
    );
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Delete an unused option from a draft Product' })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Option is still assigned to a Variant',
  )
  @ResponseMessage('Product option deleted successfully')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':optionId')
  deleteOption(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('optionId', new ParseUUIDPipe()) optionId: string,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productOptionsService.deleteOption(productId, optionId, store);
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Add a value to an option on a draft Product' })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Product is not draft or value conflicts',
  )
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post(':optionId/values')
  createValue(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('optionId', new ParseUUIDPipe()) optionId: string,
    @Body() dto: CreateProductOptionValueDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productOptionsService.createValue(
      productId,
      optionId,
      dto,
      store,
    );
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Reorder every value of an option' })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Product is not draft or order is invalid',
  )
  @ResponseMessage('Product option values reordered successfully')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Put(':optionId/values/order')
  reorderValues(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('optionId', new ParseUUIDPipe()) optionId: string,
    @Body() dto: ReorderProductOptionValuesDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productOptionsService.reorderValues(
      productId,
      optionId,
      dto,
      store,
    );
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Rename an option value on a draft Product' })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Product is not draft or value conflicts',
  )
  @ResponseMessage('Product option value updated successfully')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch(':optionId/values/:valueId')
  updateValue(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('optionId', new ParseUUIDPipe()) optionId: string,
    @Param('valueId', new ParseUUIDPipe()) valueId: string,
    @Body() dto: UpdateProductOptionValueDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productOptionsService.updateValue(
      productId,
      optionId,
      valueId,
      dto,
      store,
    );
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({
    summary: 'Delete an unused option value from a draft Product',
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Option value is still assigned to a Variant',
  )
  @ResponseMessage('Product option value deleted successfully')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':optionId/values/:valueId')
  deleteValue(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('optionId', new ParseUUIDPipe()) optionId: string,
    @Param('valueId', new ParseUUIDPipe()) valueId: string,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productOptionsService.deleteValue(
      productId,
      optionId,
      valueId,
      store,
    );
  }
}
