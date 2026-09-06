import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim() || null;
};

export class AddProductImageDto {
  @ApiPropertyOptional({
    description:
      'Accessible description for the image. Omit or send an empty value for no alt text.',
    maxLength: 255,
    nullable: true,
  })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  altText?: string | null;
}
