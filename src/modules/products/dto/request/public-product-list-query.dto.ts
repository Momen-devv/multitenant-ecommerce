import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiListQueryDto } from '@/common/api-query';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class PublicProductListQueryDto extends ApiListQueryDto {
  @ApiPropertyOptional({
    description: 'A single published Category slug',
    pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 200)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  category?: string;
}
