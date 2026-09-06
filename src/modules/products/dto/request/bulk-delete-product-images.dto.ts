import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class BulkDeleteProductImagesDto {
  @ApiProperty({
    type: () => [String],
    format: 'uuid',
    description: 'IDs of the product images to delete.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  imageIds!: string[];
}
