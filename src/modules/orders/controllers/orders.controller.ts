import {
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgRoles } from '@thallesp/nestjs-better-auth';
import { seconds, Throttle } from '@nestjs/throttler';
import { OrganizationRole, StoreStatus } from '@/common/enums';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  OrderStore,
  ResponseMessage,
} from '@/common/decorators';
import {
  OrderStoreGuard,
  type OrderStoreContext,
} from '@/common/guards/order-store.guard';
import type { CurrentUser } from '@/core/auth/auth.types';
import { Session } from '@thallesp/nestjs-better-auth';
import { CancelOrderDto, OwnerOrderListQueryDto } from '../dto';
import { OrdersRepository } from '../repos';

@ApiTags('Owner Orders')
@ApiCookieAuth('mte.session_token')
@UseGuards(OrderStoreGuard)
@OrgRoles([OrganizationRole.OWNER])
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({ summary: "List the active organization's Orders" })
  @ApiSuccessResponse({ description: 'Orders retrieved successfully' })
  @ResponseMessage('Orders retrieved successfully')
  list(
    @Query() query: OwnerOrderListQueryDto,
    @OrderStore() store: OrderStoreContext,
  ) {
    return this.ordersRepository.listOrders(store.storeId, query);
  }

  @Get(':orderId')
  @Header('Cache-Control', 'no-store')
  @ApiSuccessResponse({ description: 'Order retrieved successfully' })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Order not found')
  @ResponseMessage('Order retrieved successfully')
  get(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @OrderStore() store: OrderStoreContext,
  ) {
    return this.ordersRepository.getOrder(store.storeId, orderId);
  }

  @Post(':orderId/fulfill')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Fulfill an entire Order' })
  @ApiSuccessResponse({ description: 'Order fulfilled successfully' })
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Order cannot be fulfilled')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Order not found')
  @ResponseMessage('Order fulfilled successfully')
  fulfill(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @OrderStore() store: OrderStoreContext,
    @Session() session: CurrentUser,
  ) {
    if (store.status !== StoreStatus.ACTIVE) {
      throw new ConflictException('Inactive Stores cannot fulfill Orders.');
    }
    return this.ordersRepository.fulfillOrder(
      store.storeId,
      orderId,
      session.user.id,
    );
  }

  @Post(':orderId/cancel')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Cancel an entire Order' })
  @ApiSuccessResponse({ description: 'Order cancelled successfully' })
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Order cannot be cancelled')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Order not found')
  @ResponseMessage('Order cancelled successfully')
  cancel(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CancelOrderDto,
    @OrderStore() store: OrderStoreContext,
    @Session() session: CurrentUser,
  ) {
    return this.ordersRepository.cancelOrder(
      store.storeId,
      orderId,
      session.user.id,
      dto.reason,
    );
  }
}
