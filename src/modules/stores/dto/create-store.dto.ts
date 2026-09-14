import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  Equals,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { USD_CURRENCY } from '@/common/commerce/currency';

export class CreateStoreDto {
  @ApiProperty({
    description: 'The name of the store',
    example: 'My Store',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  name!: string;

  @ApiProperty({
    description: 'The slug for the store (optional)',
    example: 'my-store',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase letters, numbers, and hyphens only',
  })
  slug?: string;

  @ApiProperty({
    description: 'A brief description of the store (optional)',
    example: 'This is my awesome store',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description:
      'Currency for new Store business data. Omit to use the USD-only default.',
    enum: [USD_CURRENCY],
    default: USD_CURRENCY,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Equals(USD_CURRENCY, { message: 'currency must be usd' })
  currency?: typeof USD_CURRENCY;
}
