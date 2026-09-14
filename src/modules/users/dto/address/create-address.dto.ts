import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { trimStringOrNull, trimStringValue } from '@/common/utils';

export class CreateAddressDto {
  @ApiProperty({ example: 'Home', minLength: 1, maxLength: 100 })
  @Transform(trimStringValue)
  @IsString()
  @Length(1, 100)
  label!: string;

  @ApiProperty({ example: 'Ahmed Ali', minLength: 1, maxLength: 200 })
  @Transform(trimStringValue)
  @IsString()
  @Length(1, 200)
  recipientName!: string;

  @ApiProperty({
    description:
      'Delivery contact phone number. It is separate from account-phone verification.',
    example: '+201234567890',
  })
  @Transform(trimStringValue)
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/)
  recipientPhone!: string;

  @ApiProperty({ example: '12 Tahrir Square', minLength: 1, maxLength: 200 })
  @Transform(trimStringValue)
  @IsString()
  @Length(1, 200)
  addressLine1!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 200, example: 'Flat 8' })
  @Transform(trimStringOrNull)
  @IsOptional()
  @IsString()
  @Length(1, 200)
  addressLine2?: string | null;

  @ApiProperty({ example: 'Cairo', minLength: 1, maxLength: 100 })
  @Transform(trimStringValue)
  @IsString()
  @Length(1, 100)
  city!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 100, example: 'Cairo' })
  @Transform(trimStringOrNull)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  region?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 32, example: '11511' })
  @Transform(trimStringOrNull)
  @IsOptional()
  @IsString()
  @Length(1, 32)
  postalCode?: string | null;

  @ApiProperty({ example: 'EG', pattern: '^[A-Z]{2}$' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;

  @ApiPropertyOptional({
    description: 'Makes this the user’s default delivery address.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
