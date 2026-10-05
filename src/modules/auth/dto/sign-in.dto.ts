import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class SignInDto {
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
  callbackURL?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key],
  )
  @IsBoolean()
  rememberMe?: boolean;
}
