import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgRoles } from '@thallesp/nestjs-better-auth';
import { seconds, Throttle } from '@nestjs/throttler';
import { OrganizationRole } from '@/common/enums';
import {
  ActiveStore,
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
} from '@/common/decorators';
import type { ActiveStoreContext } from '@/common/guards/active-store.guard';
import { StoreMembershipGuard } from '@/common/guards/store-membership.guard';
import {
  StoreCheckoutSettingsResponseDto,
  UpdateStoreCheckoutSettingsDto,
} from '../dto';
import { StoreCheckoutSettingsService } from '../services/store-checkout-settings.service';

@ApiTags('Store Checkout Settings')
@ApiCookieAuth('mte.session_token')
@Controller('stores/me/checkout-settings')
@UseGuards(StoreMembershipGuard)
@ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Request rate limit exceeded')
export class StoreCheckoutSettingsController {
  constructor(private readonly service: StoreCheckoutSettingsService) {}

  @Get()
  @OrgRoles([OrganizationRole.OWNER, OrganizationRole.MANAGER])
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'getStoreCheckoutSettings',
    summary: 'Read Store checkout settings',
    description:
      'Owner or manager of the active organization. An unconfigured Store returns synthetic version-0 defaults without creating a row; cached online readiness is returned without a Stripe refresh.',
  })
  @ApiSuccessResponse({
    description: 'Store checkout settings retrieved successfully',
    model: StoreCheckoutSettingsResponseDto,
    example: {
      version: 0,
      currency: 'usd',
      shippingFee: 0,
      deliveryCountries: [],
      shippingPolicy: null,
      cashOnDeliveryEnabled: false,
      onlineEnabled: false,
      onlineReady: false,
    },
  })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authenticated session required')
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Store not found for active organization',
  )
  @ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    'Owner or manager membership required',
  )
  @ResponseMessage('Store checkout settings retrieved successfully')
  @HttpCode(HttpStatus.OK)
  getSettings(@ActiveStore() store: ActiveStoreContext) {
    return this.service.getSettings(store);
  }

  @Put()
  @OrgRoles([OrganizationRole.OWNER])
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'updateStoreCheckoutSettings',
    summary: 'Replace Store checkout settings',
    description:
      'Owner only. This full replacement requires every writable field. Version 0 atomically creates settings; later writes require the stored version and increment it once. Online payment may be desired before it is ready.',
  })
  @ApiSuccessResponse({
    description: 'Store checkout settings updated successfully',
    model: StoreCheckoutSettingsResponseDto,
    example: {
      version: 1,
      currency: 'usd',
      shippingFee: 5000,
      deliveryCountries: ['EG'],
      shippingPolicy: 'Delivery takes 2–5 business days.',
      cashOnDeliveryEnabled: true,
      onlineEnabled: true,
      onlineReady: false,
    },
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid complete settings body')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authenticated session required')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Owner membership required')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'STALE_VERSION: settings changed concurrently; read the current version and retry',
    {
      statusCode: 409,
      error: 'Conflict',
      message:
        'Checkout settings were changed by another request. Read the latest version and retry.',
      code: 'STALE_VERSION',
      timestamp: '2026-09-16T12:00:00.000Z',
      path: '/api/v1/stores/me/checkout-settings',
      correlationId: '01994c30-1000-7000-8000-000000000001',
    },
  )
  @ResponseMessage('Store checkout settings updated successfully')
  @HttpCode(HttpStatus.OK)
  updateSettings(
    @ActiveStore() store: ActiveStoreContext,
    @Body() dto: UpdateStoreCheckoutSettingsDto,
  ) {
    return this.service.updateSettings(store, dto);
  }
}
