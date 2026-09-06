import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsString, Length, ValidateIf } from 'class-validator';

const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim() || null;
};

export class UpdateProductImageDto {
  @ApiProperty({
    description:
      'Accessible description. Send null or an empty string to clear it.',
    maxLength: 255,
    nullable: true,
  })
  @Transform(trimOrNull)
  @IsDefined()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Length(1, 255)
  altText!: string;
}
