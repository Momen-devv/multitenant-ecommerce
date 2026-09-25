import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class CartVersionDto {
  @ApiProperty({
    description:
      'Current Cart revision. An empty synthetic Cart has version 0.',
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    example: 0,
  })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  version!: number;
}
