import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Param,
  ParseUUIDPipe,
  Query,
  Session,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import {
  ApiCookieAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { CurrentUser } from '@/core/auth/auth.types';
import {
  ResponseMessage,
  ApiErrorResponse,
  ApiSuccessResponse,
} from '@/common/decorators';
import {
  CancelOrderDto,
  OrderCursorPageDto,
  ORDER_PAYMENT_METHODS,
  ORDER_STATUSES,
  OrderQueryDto,
  OrderResponseDto,
} from '../dto';
import { OrdersService } from '../services/orders.service';
import { ORDER_LIST_EXAMPLE, ORDER_RESPONSE_EXAMPLE } from '../orders.swagger';
@ApiTags('My Orders')
@ApiCookieAuth('mte.session_token')
@ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authenticated session required')
@ApiErrorResponse(HttpStatus.FORBIDDEN, 'ACCOUNT_UNAVAILABLE')
@ApiErrorResponse(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND')
@ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED')
@Controller('users/me/orders')
export class UserOrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get()
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'listMyOrders',
    summary: 'List the shopper Orders',
  })
  @ApiQuery({
    name: 'filter[storeId][eq]',
    required: false,
    format: 'uuid',
  })
  @ApiQuery({
    name: 'filter[status][eq]',
    required: false,
    enum: ORDER_STATUSES,
  })
  @ApiQuery({
    name: 'filter[paymentMethod][eq]',
    required: false,
    enum: ORDER_PAYMENT_METHODS,
  })
  @ApiSuccessResponse({
    description: 'Orders retrieved',
    model: OrderCursorPageDto,
    example: ORDER_LIST_EXAMPLE,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'INVALID_INPUT')
  @ResponseMessage('Orders retrieved')
  list(@Session() session: CurrentUser, @Query() query: OrderQueryDto) {
    return this.orders.listOrders(session.user.id, query);
  }
  @Get(':orderId')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'getMyOrder',
    summary: 'Read immutable shopper Order details',
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiSuccessResponse({
    description: 'Order retrieved',
    model: OrderResponseDto,
    example: ORDER_RESPONSE_EXAMPLE,
  })
  @ApiErrorResponse(404, 'RESOURCE_NOT_FOUND')
  @ResponseMessage('Order retrieved')
  detail(
    @Session() session: CurrentUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.orders.detail(session.user.id, orderId);
  }

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'cancelMyOrder',
    summary: 'Cancel a placed shopper Order',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', minLength: 1, maxLength: 128 },
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'IDEMPOTENCY_KEY_REQUIRED')
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiBody({
    type: CancelOrderDto,
    examples: {
      current: { value: { version: 1, reason: 'Ordered by mistake.' } },
    },
  })
  @ApiSuccessResponse({
    description: 'Order cancelled',
    model: OrderResponseDto,
    example: ORDER_RESPONSE_EXAMPLE,
  })
  @ApiErrorResponse(
    409,
    'INVALID_ORDER_TRANSITION, STALE_VERSION, PAYMENT_REVIEW_REQUIRED, PAYMENT_NOT_CONFIRMED, or IDEMPOTENCY_CONFLICT',
  )
  @ResponseMessage('Order cancelled')
  cancel(
    @Session() session: CurrentUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CancelOrderDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.orders.shopperCancel(session.user.id, orderId, dto, key);
  }
}
