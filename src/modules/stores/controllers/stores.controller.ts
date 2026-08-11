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
  MAX_PROFILE_IMAGE_SIZE,
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
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Store not found')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ResponseMessage('Store retrieved successfully')
  @HttpCode(HttpStatus.OK)
  @Get('me')
  async getStore(@Session() session: CurrentUser) {
    return this.storesService.getStore(session.user.id);
  }
}
