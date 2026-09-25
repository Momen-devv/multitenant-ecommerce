import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Session,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import {
  ApiBody,
  ApiCookieAuth,
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
  CartDetailResponseDto,
  CartListResponseDto,
  CartVersionDto,
  PutCartItemDto,
} from '../dto';
import { CartsService } from '../services/carts.service';

@ApiTags('Carts')
@ApiCookieAuth('mte.session_token')
@Controller()
@ApiErrorResponse(
  HttpStatus.TOO_MANY_REQUESTS,
  'RATE_LIMITED: request rate limit exceeded',
)
@ApiErrorResponse(
  HttpStatus.FORBIDDEN,
  'ACCOUNT_UNAVAILABLE: the authenticated account is inactive or currently banned',
)
export class CartsController {
  constructor(private readonly carts: CartsService) {}

  @Get('users/me/carts')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'listMyCarts',
    summary: 'List the shopper’s nonempty Store carts',
    description:
      'Requires an active authenticated session. Reads do not create Cart rows; this list contains at most 20 nonempty carts.',
  })
  @ApiSuccessResponse({
    description: 'Cart summaries retrieved successfully',
    model: CartListResponseDto,
    example: {
      items: [
        {
          id: '01994c30-1000-7000-8000-000000000010',
          storeId: '01994c30-1000-7000-8000-000000000011',
          version: 7,
          itemCount: 1,
          quantityCount: 2,
          subtotal: 5000,
          currency: 'usd',
          activeCheckout: null,
          lastActivityAt: '2026-09-16T12:00:00.000Z',
        },
      ],
    },
  })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authenticated session required')
  @ResponseMessage('Cart summaries retrieved successfully')
  async list(@Session() session: CurrentUser) {
    return { items: await this.carts.list(session.user.id) };
  }

  @Get('stores/:storeId/cart')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'getStoreCart',
    summary: 'Read the shopper’s current Cart for one Store',
    description:
      'Returns a synthetic empty Cart with id null and version 0 without writing. Current catalog price and availability are shown for retained unavailable lines.',
  })
  @ApiParam({ name: 'storeId', format: 'uuid' })
  @ApiSuccessResponse({
    description: 'Cart retrieved successfully',
    model: CartDetailResponseDto,
    example: {
      id: null,
      storeId: '01994c30-1000-7000-8000-000000000011',
      version: 0,
      currency: 'usd',
      items: [],
      subtotal: 0,
      activeCheckout: null,
      lastActivityAt: null,
    },
  })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authenticated session required')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND: Store not found')
  @ResponseMessage('Cart retrieved successfully')
  get(
    @Session() session: CurrentUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
  ) {
    return this.carts.get(session.user.id, storeId);
  }

  @Put('stores/:storeId/cart/items/:variantId')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'putStoreCartItem',
    summary: 'Set a Cart item’s absolute quantity',
    description:
      'Creates a Cart only for version 0 on the first addition. Quantity is absolute, never incremental. Actual changes allocate a new non-repeating Cart revision; no-op writes preserve revision and activity time.',
  })
  @ApiParam({ name: 'storeId', format: 'uuid' })
  @ApiParam({ name: 'variantId', format: 'uuid' })
  @ApiBody({
    type: PutCartItemDto,
    examples: { create: { value: { quantity: 2, version: 0 } } },
  })
  @ApiSuccessResponse({
    description: 'Cart item saved successfully',
    model: CartDetailResponseDto,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid quantity or Cart version')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authenticated session required')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'CART_LIMIT_REACHED, CART_ITEM_LIMIT_REACHED, STALE_VERSION, PRODUCT_UNAVAILABLE, or INSUFFICIENT_STOCK',
  )
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND: Store not found')
  @ResponseMessage('Cart item saved successfully')
  putItem(
    @Session() session: CurrentUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: PutCartItemDto,
  ) {
    return this.carts.putItem(session.user.id, storeId, variantId, dto);
  }

  @Delete('stores/:storeId/cart/items/:variantId')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'deleteStoreCartItem',
    summary: 'Remove one item from a Store Cart',
    description:
      'Removal is allowed when the Store or catalog line is unavailable. A missing line at the current version is a no-op; removing the final line deletes the persisted Cart and returns the synthetic empty Cart.',
  })
  @ApiParam({ name: 'storeId', format: 'uuid' })
  @ApiParam({ name: 'variantId', format: 'uuid' })
  @ApiBody({
    type: CartVersionDto,
    examples: { current: { value: { version: 7 } } },
  })
  @ApiSuccessResponse({
    description: 'Cart item removed successfully',
    model: CartDetailResponseDto,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid Cart version')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authenticated session required')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'STALE_VERSION: Cart changed concurrently',
  )
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND: Store not found')
  @ResponseMessage('Cart item removed successfully')
  removeItem(
    @Session() session: CurrentUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: CartVersionDto,
  ) {
    return this.carts.removeItem(session.user.id, storeId, variantId, dto);
  }

  @Delete('stores/:storeId/cart')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'deleteStoreCart',
    summary: 'Delete the shopper’s entire Store Cart',
    description:
      'Deletes only the current shopper’s Cart for this Store. Empty version-0 deletion is a no-op and returns the synthetic empty Cart.',
  })
  @ApiParam({ name: 'storeId', format: 'uuid' })
  @ApiBody({
    type: CartVersionDto,
    examples: { current: { value: { version: 7 } } },
  })
  @ApiSuccessResponse({
    description: 'Cart deleted successfully',
    model: CartDetailResponseDto,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid Cart version')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authenticated session required')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'STALE_VERSION: Cart changed concurrently',
  )
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND: Store not found')
  @ResponseMessage('Cart deleted successfully')
  delete(
    @Session() session: CurrentUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: CartVersionDto,
  ) {
    return this.carts.delete(session.user.id, storeId, dto);
  }
}
