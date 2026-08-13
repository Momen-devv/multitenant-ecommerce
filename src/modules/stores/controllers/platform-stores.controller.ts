import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Session,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@thallesp/nestjs-better-auth';
import { ApiErrorResponse, ApiSuccessResponse } from '@/common/decorators';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { PlatformStoresService } from '../services/platform-stores.service';
import { ReactivateStoreDto, SuspendStoreDto } from '../dto';
import type { CurrentUser } from '@/core/auth/auth.types';

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

  @ApiOperation({ summary: 'Suspend a Store through platform oversight' })
  @ApiSuccessResponse({ description: 'Store suspended successfully' })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid suspension reason')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Invalid Store lifecycle transition')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Store not found')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Platform Super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ResponseMessage('Store suspended successfully')
  @HttpCode(HttpStatus.OK)
  @Post(':storeId/suspend')
  async suspendStore(
    @Param('storeId') storeId: string,
    @Body() dto: SuspendStoreDto,
    @Session() session: CurrentUser,
  ) {
    return this.platformStoresService.suspendStore(
      storeId,
      session.user.id,
      dto.reason,
    );
  }

  @ApiOperation({ summary: 'Reactivate a Store through platform oversight' })
  @ApiSuccessResponse({ description: 'Store reactivated successfully' })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid reactivation reason')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Invalid Store lifecycle transition')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Store not found')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Platform Super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ResponseMessage('Store reactivated successfully')
  @HttpCode(HttpStatus.OK)
  @Post(':storeId/reactivate')
  async reactivateStore(
    @Param('storeId') storeId: string,
    @Body() dto: ReactivateStoreDto,
    @Session() session: CurrentUser,
  ) {
    return this.platformStoresService.reactivateStore(
      storeId,
      session.user.id,
      dto.reason,
    );
  }
}
