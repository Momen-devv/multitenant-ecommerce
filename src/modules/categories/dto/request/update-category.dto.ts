import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { AtLeastOneField } from '@/common/decorators';
import { trimStringOrNull, trimStringValue } from '@/common/utils';

@AtLeastOneField(['name', 'slug', 'description'])
export class UpdateCategoryDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @Transform(trimStringValue)
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional({ pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' })
  @Transform(trimStringValue)
  @IsOptional()
  @IsString()
  @Length(1, 200)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  slug?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 50000 })
  @Transform(trimStringOrNull)
  @IsOptional()
  @IsString()
  @Length(1, 50000)
  description?: string | null;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
