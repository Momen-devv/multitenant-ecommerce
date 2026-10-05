import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({})
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  callbackURL?: string;
}

export class SendVerificationEmailDto {
  @ApiProperty({})
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  callbackURL?: string;
}

export class ChangeEmailDto {
  @ApiProperty({})
  @IsEmail()
  newEmail!: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  callbackURL?: string;
}
