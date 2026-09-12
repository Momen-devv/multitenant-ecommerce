import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReorderCategoryItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ReorderCategoriesDto {
  @ApiProperty({ type: () => [ReorderCategoryItemDto] })
  @IsArray()
  @ArrayUnique((item: ReorderCategoryItemDto) => item.id)
  @ValidateNested({ each: true })
  @Type(() => ReorderCategoryItemDto)
  categories!: ReorderCategoryItemDto[];
}
