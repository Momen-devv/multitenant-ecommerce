import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';
import { AtLeastOneField } from '@/common/decorators';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim() || null;
};

@AtLeastOneField(['name', 'description'])
export class UpdateProductDto {
  @ApiPropertyOptional({
    example: 'Classic T-shirt',
    minLength: 1,
    maxLength: 200,
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Send null to clear the description',
    maxLength: 50000,
    nullable: true,
  })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @Length(1, 50000)
  description?: string | null;
}
