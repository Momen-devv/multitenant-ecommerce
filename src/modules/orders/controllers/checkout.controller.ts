import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Session,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { CurrentUser } from '@/core/auth/auth.types';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
} from '@/common/decorators';
import {
  AttemptResponseDto,
  CheckoutQueryDto,
  CreateCheckoutQuoteDto,
  CursorPageDto,
  QuoteResponseDto,
  StartCheckoutDto,
  StartCheckoutResponseDto,
} from '../dto';
import { OrdersService } from '../services/orders.service';

@ApiTags('Checkout')
@ApiCookieAuth('mte.session_token')
@Controller()
export class CheckoutController {
  constructor(private readonly orders: OrdersService) {}
  @Post('stores/:storeId/cart/quote')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'createCheckoutQuote',
    summary: 'Review a five-minute immutable checkout quote',
    description:
      'Requires a verified email, verified account phone, owned Saved Address, and a serviceable Cart. Only cash on delivery is offered in this slice.',
  })
  @ApiParam({ name: 'storeId', format: 'uuid' })
  @ApiBody({ type: CreateCheckoutQuoteDto })
  @ApiSuccessResponse({
    description: 'Checkout quote created',
    model: QuoteResponseDto,
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'CART_EMPTY, STALE_VERSION, DELIVERY_UNSUPPORTED, STORE_NOT_SELLING, PAYMENT_METHOD_UNAVAILABLE, PRODUCT_UNAVAILABLE, INSUFFICIENT_STOCK, or QUOTE_CHANGED',
  )
  @ResponseMessage('Checkout quote created')
  quote(
    @Session() session: CurrentUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: CreateCheckoutQuoteDto,
  ) {
    return this.orders.quote(session.user.id, storeId, dto);
  }

  @Post('stores/:storeId/cart/checkout')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'startCheckout',
    summary: 'Start checkout from an accepted quote',
    description:
      'Requires Idempotency-Key. A COD checkout atomically places one unpaid Order, reserves inventory, and clears only this Cart. Replays return the original attempt and Order.',
  })
  @ApiParam({ name: 'storeId', format: 'uuid' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', minLength: 1, maxLength: 128 },
  })
  @ApiBody({ type: StartCheckoutDto })
  @ApiSuccessResponse({
    status: HttpStatus.CREATED,
    description: 'Checkout started',
    model: StartCheckoutResponseDto,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'IDEMPOTENCY_KEY_REQUIRED')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'QUOTE_EXPIRED, QUOTE_CHANGED, CART_LOCKED, IDEMPOTENCY_CONFLICT, PAYMENT_METHOD_UNAVAILABLE, or INSUFFICIENT_STOCK',
  )
  @ResponseMessage('Checkout completed')
  start(
    @Session() session: CurrentUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: StartCheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orders.start(session.user.id, storeId, dto, idempotencyKey);
  }

  @Get('users/me/checkouts')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'listMyCheckoutAttempts',
    summary: 'List the shopper checkout attempts',
  })
  @ApiSuccessResponse({
    description: 'Checkout attempts retrieved',
    model: CursorPageDto,
  })
  @ResponseMessage('Checkout attempts retrieved')
  attempts(@Session() session: CurrentUser, @Query() query: CheckoutQueryDto) {
    return this.orders.listAttempts(session.user.id, query);
  }
  @Get('users/me/checkouts/:attemptId')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'getMyCheckoutAttempt',
    summary: 'Read a shopper checkout attempt',
  })
  @ApiParam({ name: 'attemptId', format: 'uuid' })
  @ApiSuccessResponse({
    description: 'Checkout attempt retrieved',
    model: AttemptResponseDto,
  })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND')
  @ResponseMessage('Checkout attempt retrieved')
  attempt(
    @Session() session: CurrentUser,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.orders.attemptDetail(session.user.id, attemptId);
  }
}
