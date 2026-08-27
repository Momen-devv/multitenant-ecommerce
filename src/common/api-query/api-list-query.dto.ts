import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { ApiQueryFilterInput } from './api-query.types';
import { API_QUERY_LIMITS } from './api-query.limits';

export class ApiListQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Opaque cursor returned by a previous page',
    maxLength: API_QUERY_LIMITS.cursorLength,
  })
  @IsOptional()
  @IsString()
  @MaxLength(API_QUERY_LIMITS.cursorLength)
  cursor?: string;

  @ApiPropertyOptional({
    example: 'name,-createdAt',
    maxLength: API_QUERY_LIMITS.sortLength,
  })
  @IsOptional()
  @IsString()
  @MaxLength(API_QUERY_LIMITS.sortLength)
  sort?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    example: 'id,name,status',
    maxLength: API_QUERY_LIMITS.fieldsLength,
  })
  @IsOptional()
  @IsString()
  @MaxLength(API_QUERY_LIMITS.fieldsLength)
  fields?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'object' },
    example: { status: { eq: 'active' } },
  })
  @IsOptional()
  @IsObject()
  filter?: ApiQueryFilterInput;
}
