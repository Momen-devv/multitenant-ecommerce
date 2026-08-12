import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Session,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StoresService } from '../services/stores.service';
import { CreateStoreDto, UpdateStoreDto } from '../dto';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { seconds, Throttle } from '@nestjs/throttler';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiSuccessResponse, ApiErrorResponse } from '@/common/decorators';
import type { CurrentUser } from '@/core/auth/auth.types';
import {
  imageUploadOptions,
  MAX_STORE_LOGO_SIZE,
} from '@/infrastructure/storage/multer.config';
import { createImageFileValidator } from '@/infrastructure/storage/file-validation.config';

@ApiTags('Stores')
@ApiCookieAuth()
@Controller()
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @ApiOperation({ summary: 'Create a new store' })
  @ApiSuccessResponse({ description: 'Store created successfully' })
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Store already exists')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  @ResponseMessage('Store created successfully')
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async createStore(
    @Body() dto: CreateStoreDto,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    return this.storesService.createStore(dto, session.user.id, headers);
  }

  @ApiOperation({ summary: 'Get my store' })
  @ApiSuccessResponse({ description: 'Store retrieved successfully' })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Store not found or you do not have store',
  )
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ResponseMessage('Store retrieved successfully')
  @HttpCode(HttpStatus.OK)
  @Get('me')
  async getStore(@Session() session: CurrentUser) {
    return this.storesService.getStore(session.user.id);
  }

  @ApiOperation({ summary: 'Update my store' })
  @ApiSuccessResponse({ description: 'Store updated successfully' })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Store not found or you do not have store',
  )
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ResponseMessage('Store updated successfully')
  @HttpCode(HttpStatus.OK)
  @Patch('me')
  async updateStore(
    @Body() dto: UpdateStoreDto,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    return this.storesService.updateStore(dto, session.user.id, headers);
  }

  @ApiOperation({ summary: 'Upload store logo' })
  @ApiSuccessResponse({ description: 'Store logo uploaded successfully' })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Store not found or you do not have store',
  )
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid file')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ResponseMessage('Store logo uploaded successfully')
  @UseInterceptors(FileInterceptor('logo', imageUploadOptions))
  @HttpCode(HttpStatus.OK)
  @Post('me/logo')
  async uploadStoreLogo(
    @UploadedFile(createImageFileValidator({ maxSize: MAX_STORE_LOGO_SIZE }))
    logo: Express.Multer.File,
    @Session() session: CurrentUser,
  ) {
    await this.storesService.uploadStoreLogo(logo, session.user.id);
  }
}
