import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateProductOptionDto {
  @ApiProperty({ example: 'Color', minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;
}

export class UpdateProductOptionDto extends CreateProductOptionDto {}

export class CreateProductOptionValueDto {
  @ApiProperty({ example: 'Red', minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  value!: string;
}

export class UpdateProductOptionValueDto extends CreateProductOptionValueDto {}

export class ReorderProductOptionValuesDto {
  @ApiProperty({ type: () => [String], format: 'uuid' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  valueIds!: string[];
}
