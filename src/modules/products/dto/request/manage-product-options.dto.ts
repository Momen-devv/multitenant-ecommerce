import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProductOptionDto {
  @ApiProperty({ example: 'Color', minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name!: string;
}

export class UpdateProductOptionDto extends CreateProductOptionDto {}

export class CreateProductOptionValueDto {
  @ApiProperty({ example: 'Red', minLength: 1, maxLength: 100 })
  @Transform(trim)
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
