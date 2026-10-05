import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class AccountInfoDto {
  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  providerId?: string;
}

export class UnlinkAccountDto {
  @ApiProperty({})
  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  accountId?: string;
}

export class ProviderTokenDto {
  @ApiProperty({})
  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  accountId?: string;
}

export class AuthErrorDto {
  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  error?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsString()
  error_description?: string;
}
