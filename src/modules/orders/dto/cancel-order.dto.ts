import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { trimStringValue } from '@/common/utils';

export class CancelOrderDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimStringValue)
  @IsString()
  @IsNotEmpty()
  @Length(1, 500)
  reason!: string;
}
