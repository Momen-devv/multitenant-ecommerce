import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { trimStringOrNull, trimStringValue } from '@/common/utils';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Summer Shoes', minLength: 1, maxLength: 200 })
  @Transform(trimStringValue)
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiPropertyOptional({
    example: 'summer-shoes',
    pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
    maxLength: 200,
  })
  @Transform(trimStringOrNull)
  @IsOptional()
  @IsString()
  @Length(1, 200)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  slug?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 50000 })
  @Transform(trimStringOrNull)
  @IsOptional()
  @IsString()
  @Length(1, 50000)
  description?: string | null;
}
