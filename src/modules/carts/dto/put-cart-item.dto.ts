import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { CartVersionDto } from './cart-version.dto';
import {
  MAX_CART_ITEM_QUANTITY,
  MIN_CART_ITEM_QUANTITY,
} from '../domain/cart-limits';

export class PutCartItemDto extends CartVersionDto {
  @ApiProperty({
    minimum: MIN_CART_ITEM_QUANTITY,
    maximum: MAX_CART_ITEM_QUANTITY,
    example: 2,
  })
  @IsInt()
  @Min(MIN_CART_ITEM_QUANTITY)
  @Max(MAX_CART_ITEM_QUANTITY)
  quantity!: number;
}
