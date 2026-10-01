import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class CommentContentDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 2000)
  content!: string;
}

export class ProductCommentDto {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() content!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ProductCommentListDto {
  @ApiProperty({ type: [ProductCommentDto] })
  items!: ProductCommentDto[];

  @ApiProperty({
    type: 'object',
    properties: {
      nextCursor: { type: 'string', nullable: true },
      hasNextPage: { type: 'boolean' },
    },
  })
  pageInfo!: { nextCursor: string | null; hasNextPage: boolean };
}
