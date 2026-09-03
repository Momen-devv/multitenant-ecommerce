import { ApiProperty } from '@nestjs/swagger';

export class ProductResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ['draft', 'published', 'archived'] })
  status!: 'draft' | 'published' | 'archived';

  @ApiProperty({ example: 'usd' })
  currency!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  variants!: object[];

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  options!: object[];

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  gallery!: object[];
}
