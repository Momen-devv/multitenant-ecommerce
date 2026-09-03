import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim() || null;
};

export class CreateProductDto {
  @ApiProperty({ example: 'Classic T-shirt', minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiProperty({
    example: 'classic-t-shirt',
    required: false,
    pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
    maxLength: 200,
  })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @Length(1, 200)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug can contain only lowercase letters, numbers, and hyphens',
  })
  slug?: string | null;

  @ApiProperty({ required: false, maxLength: 50000 })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @Length(1, 50000)
  description?: string | null;
}
