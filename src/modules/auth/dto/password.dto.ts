import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class VerifyPasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  newPassword!: string;

  @ApiProperty({})
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class RequestPasswordResetDto {
  @ApiProperty({})
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  redirectTo?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  newPassword!: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key],
  )
  @IsBoolean()
  revokeOtherSessions?: boolean;
}
