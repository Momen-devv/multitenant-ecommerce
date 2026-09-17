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
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { OrgRoles } from '@thallesp/nestjs-better-auth';
import { Throttle, seconds } from '@nestjs/throttler';
import {
  ActiveStore,
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
} from '@/common/decorators';
import type { ActiveStoreContext } from '@/common/guards/active-store.guard';
import { StoreMembershipGuard } from '@/common/guards/store-membership.guard';
import { OrganizationRole } from '@/common/enums';
import type { CurrentUser } from '@/core/auth/auth.types';
import {
  DeliverOrderDto,
  OrderCursorPageDto,
  ORDER_PAYMENT_METHODS,
  ORDER_STATUSES,
  OrderQueryDto,
  OrderResponseDto,
  OrderVersionDto,
  ReturnToStoreOrderDto,
  ShipOrderDto,
  StaffCancelOrderDto,
} from '../dto';
import { OrdersService } from '../services/orders.service';
import { ORDER_LIST_EXAMPLE, ORDER_RESPONSE_EXAMPLE } from '../orders.swagger';

@ApiTags('Store Orders')
@ApiCookieAuth('mte.session_token')
@ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authenticated session required')
@ApiErrorResponse(
  HttpStatus.FORBIDDEN,
  'STORE_ROLE_REQUIRED or ACCOUNT_UNAVAILABLE',
)
@ApiErrorResponse(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND')
@ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED')
@Controller('stores/me/orders')
@UseGuards(StoreMembershipGuard)
export class StoreOrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get()
  @OrgRoles([
    OrganizationRole.OWNER,
    OrganizationRole.MANAGER,
    OrganizationRole.SUPPORT,
  ])
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'listStoreOrders',
    summary: 'List Orders for the active Store',
    description:
      'Membership-only context supports historical fulfillment for closed or suspended Stores.',
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
  list(
    @ActiveStore() store: ActiveStoreContext,
    @Query() query: OrderQueryDto,
  ) {
    return this.orders.listStoreOrders(store.storeId, query);
  }

  @Get(':orderId')
  @OrgRoles([
    OrganizationRole.OWNER,
    OrganizationRole.MANAGER,
    OrganizationRole.SUPPORT,
  ])
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({ operationId: 'getStoreOrder', summary: 'Read a Store Order' })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiSuccessResponse({
    description: 'Order retrieved',
    model: OrderResponseDto,
    example: ORDER_RESPONSE_EXAMPLE,
  })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND')
  @ResponseMessage('Order retrieved')
  detail(
    @ActiveStore() store: ActiveStoreContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.orders.storeDetail(
      store.storeId,
      orderId,
      store.membershipRole!,
    );
  }

  @Post(':orderId/prepare')
  @HttpCode(HttpStatus.OK)
  @OrgRoles([OrganizationRole.OWNER, OrganizationRole.MANAGER])
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'prepareStoreOrder',
    summary: 'Mark a placed Order as preparing',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', minLength: 1, maxLength: 128 },
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiBody({
    type: OrderVersionDto,
    examples: { current: { value: { version: 1 } } },
  })
  @ApiSuccessResponse({
    description: 'Order is preparing',
    model: OrderResponseDto,
    example: ORDER_RESPONSE_EXAMPLE,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'IDEMPOTENCY_KEY_REQUIRED')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'INVALID_ORDER_TRANSITION, STALE_VERSION, PAYMENT_REVIEW_REQUIRED, PAYMENT_NOT_CONFIRMED, or IDEMPOTENCY_CONFLICT',
  )
  @ResponseMessage('Order is preparing')
  prepare(
    @Session() session: CurrentUser,
    @ActiveStore() store: ActiveStoreContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: OrderVersionDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.orders.prepare(
      session.user.id,
      store.storeId,
      orderId,
      dto,
      key,
    );
  }

  @Post(':orderId/ship')
  @HttpCode(HttpStatus.OK)
  @OrgRoles([OrganizationRole.OWNER, OrganizationRole.MANAGER])
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'shipStoreOrder',
    summary: 'Ship a preparing Order and consume held stock',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', minLength: 1, maxLength: 128 },
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiBody({
    type: ShipOrderDto,
    examples: {
      tracked: {
        value: {
          version: 2,
          carrier: 'Example Carrier',
          trackingNumber: 'EX-12345',
        },
      },
    },
  })
  @ApiSuccessResponse({
    description: 'Order shipped',
    model: OrderResponseDto,
    example: ORDER_RESPONSE_EXAMPLE,
  })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'IDEMPOTENCY_KEY_REQUIRED or TRACKING_PAIR_REQUIRED',
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'INVALID_ORDER_TRANSITION, STALE_VERSION, PAYMENT_REVIEW_REQUIRED, PAYMENT_NOT_CONFIRMED, INVENTORY_STATE_CONFLICT, or IDEMPOTENCY_CONFLICT',
  )
  @ResponseMessage('Order shipped')
  ship(
    @Session() session: CurrentUser,
    @ActiveStore() store: ActiveStoreContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: ShipOrderDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.orders.ship(session.user.id, store.storeId, orderId, dto, key);
  }

  @Post(':orderId/deliver')
  @HttpCode(HttpStatus.OK)
  @OrgRoles([OrganizationRole.OWNER, OrganizationRole.MANAGER])
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'deliverStoreOrder',
    summary: 'Mark a shipped Order delivered; COD requires cashCollected true',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', minLength: 1, maxLength: 128 },
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiBody({
    type: DeliverOrderDto,
    examples: { cod: { value: { version: 3, cashCollected: true } } },
  })
  @ApiSuccessResponse({
    description: 'Order delivered',
    model: OrderResponseDto,
    example: ORDER_RESPONSE_EXAMPLE,
  })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'IDEMPOTENCY_KEY_REQUIRED or CASH_COLLECTION_NOT_APPLICABLE',
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'INVALID_ORDER_TRANSITION, STALE_VERSION, PAYMENT_REVIEW_REQUIRED, PAYMENT_NOT_CONFIRMED, CASH_COLLECTION_REQUIRED, or IDEMPOTENCY_CONFLICT',
  )
  @ResponseMessage('Order delivered')
  deliver(
    @Session() session: CurrentUser,
    @ActiveStore() store: ActiveStoreContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: DeliverOrderDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.orders.deliver(
      session.user.id,
      store.storeId,
      orderId,
      dto,
      key,
    );
  }

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @OrgRoles([OrganizationRole.OWNER, OrganizationRole.MANAGER])
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'cancelStoreOrder',
    summary: 'Cancel a placed or preparing Order',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', minLength: 1, maxLength: 128 },
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiBody({
    type: StaffCancelOrderDto,
    examples: {
      current: { value: { version: 1, reason: 'Requested before dispatch.' } },
    },
  })
  @ApiSuccessResponse({
    description: 'Order cancelled',
    model: OrderResponseDto,
    example: ORDER_RESPONSE_EXAMPLE,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'IDEMPOTENCY_KEY_REQUIRED')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'INVALID_ORDER_TRANSITION, STALE_VERSION, PAYMENT_REVIEW_REQUIRED, PAYMENT_NOT_CONFIRMED, REFUND_WORKFLOW_UNAVAILABLE, or IDEMPOTENCY_CONFLICT',
  )
  @ResponseMessage('Order cancelled')
  cancel(
    @Session() session: CurrentUser,
    @ActiveStore() store: ActiveStoreContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: StaffCancelOrderDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.orders.staffCancel(
      session.user.id,
      store.storeId,
      orderId,
      dto,
      key,
    );
  }

  @Post(':orderId/return-to-store')
  @HttpCode(HttpStatus.OK)
  @OrgRoles([OrganizationRole.OWNER, OrganizationRole.MANAGER])
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'returnStoreOrder',
    summary: 'Confirm failed-delivery return and restore tracked stock once',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', minLength: 1, maxLength: 128 },
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiBody({
    type: ReturnToStoreOrderDto,
    examples: {
      received: {
        value: {
          version: 4,
          reason: 'Shipment was returned by the carrier.',
          itemsReceived: true,
        },
      },
    },
  })
  @ApiSuccessResponse({
    description: 'Order returned to Store',
    model: OrderResponseDto,
    example: ORDER_RESPONSE_EXAMPLE,
  })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'IDEMPOTENCY_KEY_REQUIRED or ITEMS_RECEIPT_REQUIRED',
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'INVALID_ORDER_TRANSITION, STALE_VERSION, PAYMENT_REVIEW_REQUIRED, PAYMENT_NOT_CONFIRMED, REFUND_WORKFLOW_UNAVAILABLE, INVENTORY_STATE_CONFLICT, or IDEMPOTENCY_CONFLICT',
  )
  @ResponseMessage('Order returned to Store')
  returnToStore(
    @Session() session: CurrentUser,
    @ActiveStore() store: ActiveStoreContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: ReturnToStoreOrderDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.orders.returnToStore(
      session.user.id,
      store.storeId,
      orderId,
      dto,
      key,
    );
  }
}
