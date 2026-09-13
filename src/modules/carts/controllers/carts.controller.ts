import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { seconds, Throttle } from '@nestjs/throttler';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
} from '@/common/decorators';
import { ParseSlugPipe } from '@/common/pipes/parse-slug.pipe';
import { OrdersRepository } from '@/modules/orders/repos';
import { CartsService } from '../services/carts.service';
import {
  CheckoutCartDto,
  RemoveCartItemDto,
  SetCartItemQuantityDto,
} from '../dto';

const CART_TOKEN_HEADER = 'x-cart-token';

@ApiTags('Guest Carts')
@AllowAnonymous()
@Controller('stores/:storeSlug/carts')
export class CartsController {
  constructor(
    private readonly cartsService: CartsService,
    private readonly ordersRepository: OrdersRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Create a guest Cart' })
  @ApiSuccessResponse({
    status: HttpStatus.CREATED,
    description: 'Guest Cart created successfully',
  })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Store not found or inactive')
  @ResponseMessage('Guest Cart created successfully')
  create(@Param('storeSlug', ParseSlugPipe) storeSlug: string) {
    return this.cartsService.create(storeSlug);
  }

  @Get(':cartId')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiHeader({ name: CART_TOKEN_HEADER, required: true })
  @ApiSuccessResponse({ description: 'Cart retrieved successfully' })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Cart not found')
  @ResponseMessage('Cart retrieved successfully')
  read(
    @Param('storeSlug', ParseSlugPipe) storeSlug: string,
    @Param('cartId', ParseUUIDPipe) cartId: string,
    @Headers(CART_TOKEN_HEADER) token: string | undefined,
  ) {
    return this.cartsService.read(
      storeSlug,
      cartId,
      requiredHeader(token, CART_TOKEN_HEADER),
    );
  }

  @Put(':cartId/items/:variantId')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiHeader({ name: CART_TOKEN_HEADER, required: true })
  @ApiSuccessResponse({
    description: 'Cart item quantity updated successfully',
  })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Cart not found')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Cart is stale or unavailable')
  @ResponseMessage('Cart item quantity updated successfully')
  setQuantity(
    @Param('storeSlug', ParseSlugPipe) storeSlug: string,
    @Param('cartId', ParseUUIDPipe) cartId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Headers(CART_TOKEN_HEADER) token: string | undefined,
    @Body() dto: SetCartItemQuantityDto,
  ) {
    return this.cartsService.setQuantity(
      storeSlug,
      cartId,
      requiredHeader(token, CART_TOKEN_HEADER),
      variantId,
      dto,
    );
  }

  @Delete(':cartId/items/:variantId')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiHeader({ name: CART_TOKEN_HEADER, required: true })
  @ApiSuccessResponse({ description: 'Cart item removed successfully' })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Cart not found')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Cart is stale or unavailable')
  @ResponseMessage('Cart item removed successfully')
  remove(
    @Param('storeSlug', ParseSlugPipe) storeSlug: string,
    @Param('cartId', ParseUUIDPipe) cartId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Headers(CART_TOKEN_HEADER) token: string | undefined,
    @Body() dto: RemoveCartItemDto,
  ) {
    return this.cartsService.remove(
      storeSlug,
      cartId,
      requiredHeader(token, CART_TOKEN_HEADER),
      variantId,
      dto,
    );
  }

  @Post(':cartId/checkout')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'Place a guest Order',
    description:
      'Retry a lost response with the same Cart token, Idempotency-Key, and body to recover the original placement receipt.',
  })
  @ApiHeader({ name: CART_TOKEN_HEADER, required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiSuccessResponse({
    status: HttpStatus.CREATED,
    description: 'Order placed successfully',
  })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Cart not found')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Cart is stale or cannot be checked out',
  )
  @ResponseMessage('Order placed successfully')
  checkout(
    @Param('storeSlug', ParseSlugPipe) storeSlug: string,
    @Param('cartId', ParseUUIDPipe) cartId: string,
    @Headers(CART_TOKEN_HEADER) token: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CheckoutCartDto,
  ) {
    return this.checkoutForStore(storeSlug, cartId, token, idempotencyKey, dto);
  }

  private async checkoutForStore(
    storeSlug: string,
    cartId: string,
    token: string | undefined,
    idempotencyKey: string | undefined,
    dto: CheckoutCartDto,
  ) {
    const cartToken = requiredHeader(token, CART_TOKEN_HEADER);
    await this.cartsService.assertCheckoutAccess(storeSlug, cartId, cartToken);
    return this.ordersRepository.placeOrder(cartId, cartToken, {
      ...dto,
      idempotencyKey: requiredHeader(idempotencyKey, 'idempotency-key'),
    });
  }
}

function requiredHeader(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 255) {
    throw new BadRequestException(`${name} header is required.`);
  }
  return normalized;
}
