import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class SignUpDto {
  @ApiProperty({})
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({})
  @IsEmail()
  email!: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  callbackURL?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key],
  )
  @IsBoolean()
  rememberMe?: boolean;
}
