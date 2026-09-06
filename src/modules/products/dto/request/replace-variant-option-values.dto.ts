import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReplaceVariantOptionValuesDto {
  @ApiProperty({
    type: () => [String],
    format: 'uuid',
    description: 'Exactly one current value ID for each Product option.',
  })
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  optionValueIds!: string[];
}
