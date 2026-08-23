import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Session,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
} from '@/common/decorators';
import type { CurrentUser } from '@/core/auth/auth.types';
import { CreateBillingPortalDto, CreateSubscriptionCheckoutDto } from '../dto';
import { SubscriptionsService } from '../services/subscriptions.service';

@ApiTags('Subscriptions')
@ApiCookieAuth('mte.session_token')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @ApiOperation({ summary: 'Get the current store subscription' })
  @ApiSuccessResponse({ description: 'Subscription retrieved successfully' })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Store not found')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ResponseMessage('Subscription retrieved successfully')
  @Get('current')
  async getCurrent(@Session() session: CurrentUser) {
    return this.subscriptionsService.getCurrent(session.user.id);
  }

  @ApiOperation({ summary: 'Create a Stripe subscription Checkout session' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique key for safely retrying this Checkout request',
    required: true,
  })
  @ApiSuccessResponse({
    status: HttpStatus.CREATED,
    description: 'Checkout session created successfully',
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid request')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Subscription already exists')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Store or plan price not found')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ResponseMessage('Checkout session created successfully')
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  async createCheckout(
    @Body() dto: CreateSubscriptionCheckoutDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Session() session: CurrentUser,
  ) {
    return this.subscriptionsService.createCheckout(
      session.user.id,
      session.user.email,
      dto,
      idempotencyKey ?? '',
    );
  }

  @ApiOperation({ summary: 'Create a Stripe customer portal session' })
  @ApiSuccessResponse({
    status: HttpStatus.CREATED,
    description: 'Billing portal session created successfully',
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid return URL')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Store or billing customer not found')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ResponseMessage('Billing portal session created successfully')
  @Post('portal')
  @HttpCode(HttpStatus.CREATED)
  async createPortal(
    @Body() dto: CreateBillingPortalDto,
    @Session() session: CurrentUser,
  ) {
    return this.subscriptionsService.createPortal(session.user.id, dto);
  }
}
