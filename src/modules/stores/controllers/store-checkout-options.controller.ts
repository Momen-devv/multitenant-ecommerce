import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
} from '@/common/decorators';
import { StoreCheckoutOptionsResponseDto } from '../dto';
import { StoreCheckoutSettingsService } from '../services/store-checkout-settings.service';

@ApiTags('Checkout')
@ApiCookieAuth('mte.session_token')
@Controller('stores')
@ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Request rate limit exceeded')
export class StoreCheckoutOptionsController {
  constructor(private readonly service: StoreCheckoutSettingsService) {}

  @Get(':storeId/checkout-options')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'getStoreCheckoutOptions',
    summary: 'Read effective checkout options for a Store',
    description:
      'Any authenticated shopper may read this. It uses the requested Store, requires no Store membership or active organization, and never exposes payment-account details. Online remains unavailable until ticket 06 implements its checkout flow.',
  })
  @ApiParam({
    name: 'storeId',
    format: 'uuid',
    example: '01994c30-1000-7000-8000-000000000001',
  })
  @ApiSuccessResponse({
    description: 'Store checkout options retrieved successfully',
    model: StoreCheckoutOptionsResponseDto,
    example: {
      currency: 'usd',
      shippingFee: 5000,
      deliveryCountries: ['EG'],
      shippingPolicy: null,
      paymentMethods: ['cash_on_delivery'],
      checkoutAvailable: true,
    },
  })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authenticated session required')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Store not found')
  @ResponseMessage('Store checkout options retrieved successfully')
  @HttpCode(HttpStatus.OK)
  getOptions(@Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.service.getCheckoutOptions(storeId);
  }
}
