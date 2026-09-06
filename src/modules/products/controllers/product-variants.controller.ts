import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
} from '@/common/decorators';
import { OrgRoles } from '@thallesp/nestjs-better-auth';
import { OrganizationRole } from '@/common/enums';
import { ActiveStore } from '@/common/decorators';
import {
  ActiveStoreGuard,
  type ActiveStoreContext,
} from '@/common/guards/active-store.guard';
import {
  CreateProductVariantDto,
  ReplaceVariantOptionValuesDto,
  UpdateProductInventoryDto,
  UpdateProductVariantDto,
} from '../dto';
import {
  OwnerProductVariantResponseDto,
  ProductVariantBarcodeResponseDto,
} from '../dto';
import { ProductVariantsService } from '../services/product-variants.service';

@ApiTags('Product Variants')
@ApiCookieAuth('mte.session_token')
@UseGuards(ActiveStoreGuard)
@Controller('products/:productId/variants')
export class ProductVariantsController {
  constructor(
    private readonly productVariantsService: ProductVariantsService,
  ) {}

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({
    summary: 'Create the default Variant for a draft simple Product',
  })
  @ApiSuccessResponse({
    status: 201,
    description: 'Variant created successfully',
    model: OwnerProductVariantResponseDto,
  })
  @ApiErrorResponse(409, 'Variant already exists or an identifier conflicts')
  @ResponseMessage('Variant created successfully')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post()
  createVariant(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: CreateProductVariantDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productVariantsService.createVariant(productId, dto, store);
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'List owner Variants for a Product' })
  @ApiSuccessResponse({
    description: 'Variants retrieved successfully',
    model: OwnerProductVariantResponseDto,
  })
  @ResponseMessage('Variants retrieved successfully')
  @Get()
  listVariants(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Query('archived', new ParseBoolPipe({ optional: true }))
    archived: boolean | undefined,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productVariantsService.listVariants(
      productId,
      archived === true,
      store,
    );
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Get an owner Variant' })
  @ApiSuccessResponse({
    description: 'Variant retrieved successfully',
    model: OwnerProductVariantResponseDto,
  })
  @ResponseMessage('Variant retrieved successfully')
  @Get(':variantId')
  getVariant(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productVariantsService.getVariant(productId, variantId, store);
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Get a Variant barcode as Code 128 text' })
  @ApiSuccessResponse({
    description: 'Barcode retrieved successfully',
    model: ProductVariantBarcodeResponseDto,
  })
  @ResponseMessage('Barcode retrieved successfully')
  @Get(':variantId/barcode')
  getBarcode(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productVariantsService.getBarcode(productId, variantId, store);
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({
    summary: 'Replace one draft Variant’s option-value selections',
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Product is not draft or selection conflicts',
  )
  @ResponseMessage('Variant option values replaced successfully')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Put(':variantId/option-values')
  replaceOptionValues(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() dto: ReplaceVariantOptionValuesDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productVariantsService.replaceOptionValues(
      productId,
      variantId,
      dto,
      store,
    );
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Update mutable Variant fields' })
  @ApiSuccessResponse({
    description: 'Variant updated successfully',
    model: OwnerProductVariantResponseDto,
  })
  @ApiErrorResponse(409, 'Variant version is stale or an identifier conflicts')
  @ResponseMessage('Variant updated successfully')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Patch(':variantId')
  updateVariant(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() dto: UpdateProductVariantDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productVariantsService.updateVariant(
      productId,
      variantId,
      dto,
      store,
    );
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Update a Variant inventory policy and balance' })
  @ApiSuccessResponse({
    description: 'Variant inventory updated successfully',
    model: OwnerProductVariantResponseDto,
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Variant version is stale, archived, or reserved inventory exceeds on-hand inventory',
  )
  @ResponseMessage('Variant inventory updated successfully')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Patch(':variantId/inventory')
  updateInventory(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() dto: UpdateProductInventoryDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productVariantsService.updateInventory(
      productId,
      variantId,
      dto,
      store,
    );
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
