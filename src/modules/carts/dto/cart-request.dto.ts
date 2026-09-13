import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SetCartItemQuantityDto {
  @ApiProperty({ minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class RemoveCartItemDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CheckoutContactDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Type(() => String)
  @IsString()
  @Length(1, 200)
  recipientName!: string;

  @ApiProperty({ format: 'email', maxLength: 320 })
  @Type(() => String)
  @IsEmail()
  @Length(1, 320)
  email!: string;

  @ApiProperty({ minLength: 7, maxLength: 30 })
  @Type(() => String)
  @Matches(/^[+0-9()\-\s]{7,30}$/)
  phone!: string;
}

export class CheckoutDeliveryAddressDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Type(() => String)
  @IsString()
  @Length(1, 200)
  addressLine1!: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @Type(() => String)
  @IsString()
  @Length(1, 200)
  addressLine2?: string;

  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Type(() => String)
  @IsString()
  @Length(1, 100)
  city!: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @Type(() => String)
  @IsString()
  @Length(1, 100)
  region?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 30 })
  @IsOptional()
  @Type(() => String)
  @IsString()
  @Length(1, 30)
  postalCode?: string;

  @ApiProperty({ example: 'EG', pattern: '^[A-Z]{2}$' })
  @Type(() => String)
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;
}

export class CheckoutCartDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedCartVersion!: number;

  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  quoteFingerprint!: string;

  @ApiProperty({ type: () => CheckoutContactDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CheckoutContactDto)
  contact!: CheckoutContactDto;

  @ApiProperty({ type: () => CheckoutDeliveryAddressDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CheckoutDeliveryAddressDto)
  deliveryAddress!: CheckoutDeliveryAddressDto;
}
