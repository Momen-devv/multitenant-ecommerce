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
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { seconds, Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
  productImagesUploadOptions,
  MAX_PRODUCT_IMAGE_SIZE,
  MAX_PRODUCT_IMAGES_PER_UPLOAD,
} from '@/infrastructure/storage/multer.config';
import {
  AddProductImageDto,
  BulkDeleteProductImagesDto,
  ReorderProductImagesDto,
  UpdateProductImageDto,
} from '../dto';
import { ProductImagesService } from '../services/product-images.service';
import { createImageFileValidator } from '@/infrastructure/storage/file-validation.config';

@ApiTags('Product Images')
@ApiCookieAuth('mte.session_token')
@UseGuards(ActiveStoreGuard)
@Controller('products/:productId/images')
export class ProductImagesController {
  constructor(private readonly productImagesService: ProductImagesService) {}

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Add an image to a Product gallery' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string', format: 'binary' },
        altText: { type: 'string', nullable: true },
      },
      required: ['image'],
    },
  })
  @ApiSuccessResponse({
    status: HttpStatus.CREATED,
    description: 'Product image added successfully',
  })
  @ApiErrorResponse(HttpStatus.UNPROCESSABLE_ENTITY, 'Invalid image content')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Product gallery already has 10 images',
  )
  @ResponseMessage('Product image added successfully')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @UseInterceptors(FileInterceptor('image', productImagesUploadOptions))
  @Post()
  addImage(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @UploadedFile(createImageFileValidator({ maxSize: MAX_PRODUCT_IMAGE_SIZE }))
    image: Express.Multer.File,
    @Body() dto: AddProductImageDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productImagesService.addImage(productId, image, dto, store);
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Add multiple images to a Product gallery' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          maxItems: MAX_PRODUCT_IMAGES_PER_UPLOAD,
        },
      },
      required: ['images'],
    },
  })
  @ApiSuccessResponse({
    status: HttpStatus.CREATED,
    description: 'Product images added successfully',
  })
  @ApiErrorResponse(HttpStatus.UNPROCESSABLE_ENTITY, 'Invalid image content')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Product gallery already has 10 images',
  )
  @ResponseMessage('Product images added successfully')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @UseInterceptors(
    FilesInterceptor(
      'images',
      MAX_PRODUCT_IMAGES_PER_UPLOAD,
      productImagesUploadOptions,
    ),
  )
  @Post('bulk')
  addImages(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @UploadedFiles() images: Express.Multer.File[],
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productImagesService.addImages(productId, images, store);
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'List Product gallery images' })
  @ApiSuccessResponse({ description: 'Product images retrieved successfully' })
  @ResponseMessage('Product images retrieved successfully')
  @Get()
  listImages(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productImagesService.listImages(productId, store);
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Reorder every Product gallery image' })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Product is archived or the image order is invalid',
  )
  @ResponseMessage('Product images reordered successfully')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Put('order')
  reorderImages(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: ReorderProductImagesDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productImagesService.reorderImages(productId, dto, store);
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Update Product image alt text' })
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Product is archived')
  @ResponseMessage('Product image updated successfully')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch(':imageId')
  updateImage(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
    @Body() dto: UpdateProductImageDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productImagesService.updateImage(
      productId,
      imageId,
      dto,
      store,
    );
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Delete multiple Product gallery images' })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Product or one or more product images were not found',
  )
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Product is archived')
  @ResponseMessage('Product images deleted successfully')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('bulk')
  deleteImages(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: BulkDeleteProductImagesDto,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productImagesService.deleteImages(productId, dto, store);
  }

  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Delete a Product gallery image' })
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Product is archived')
  @ResponseMessage('Product image deleted successfully')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':imageId')
  deleteImage(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
    @ActiveStore() store: ActiveStoreContext,
  ) {
    return this.productImagesService.deleteImage(productId, imageId, store);
  }
}
