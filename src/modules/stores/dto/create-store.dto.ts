import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

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
}
