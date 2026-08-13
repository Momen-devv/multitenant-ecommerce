import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@thallesp/nestjs-better-auth';
import { ApiErrorResponse, ApiSuccessResponse } from '@/common/decorators';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { PlatformStoresService } from '../services/platform-stores.service';

@ApiTags('Platform Stores')
@ApiCookieAuth()
@Roles(['superAdmin'])
@Controller('platform/stores')
export class PlatformStoresController {
  constructor(private readonly platformStoresService: PlatformStoresService) {}

  @ApiOperation({ summary: 'List all Stores for platform oversight' })
  @ApiSuccessResponse({ description: 'Stores retrieved successfully' })
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Platform Super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ResponseMessage('Stores retrieved successfully')
  @HttpCode(HttpStatus.OK)
  @Get()
  async listStores() {
    return this.platformStoresService.listStores();
  }

  @ApiOperation({ summary: 'Inspect a Store through platform oversight' })
  @ApiSuccessResponse({ description: 'Store retrieved successfully' })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Store not found')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Platform Super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ResponseMessage('Store retrieved successfully')
  @HttpCode(HttpStatus.OK)
  @Get(':storeId')
  async getStore(@Param('storeId') storeId: string) {
    return this.platformStoresService.getStore(storeId);
  }
}
