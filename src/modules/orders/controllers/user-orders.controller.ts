import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Session,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { CurrentUser } from '@/core/auth/auth.types';
import {
  ResponseMessage,
  ApiErrorResponse,
  ApiSuccessResponse,
} from '@/common/decorators';
import { CursorPageDto, OrderQueryDto, OrderResponseDto } from '../dto';
import { OrdersService } from '../services/orders.service';
@ApiTags('My Orders')
@ApiCookieAuth('mte.session_token')
@Controller('users/me/orders')
export class UserOrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get()
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'listMyOrders',
    summary: 'List the shopper Orders',
  })
  @ApiSuccessResponse({ description: 'Orders retrieved', model: CursorPageDto })
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
  })
  @ApiErrorResponse(404, 'RESOURCE_NOT_FOUND')
  @ResponseMessage('Order retrieved')
  detail(
    @Session() session: CurrentUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.orders.detail(session.user.id, orderId);
  }
}
