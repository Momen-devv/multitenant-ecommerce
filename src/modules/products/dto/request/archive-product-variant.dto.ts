import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class ArchiveProductVariantDto {
  @ApiProperty({
    minimum: 1,
    description: 'The Variant version currently held by the caller.',
  })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
