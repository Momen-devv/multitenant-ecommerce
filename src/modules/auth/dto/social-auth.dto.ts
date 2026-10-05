import { Type, Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProviderNameDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;
}

export class ProviderUserDto {
  @ApiPropertyOptional({ type: ProviderNameDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProviderNameDto)
  name?: ProviderNameDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class IdTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nonce?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  expiresAt?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional({ type: ProviderUserDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProviderUserDto)
  user?: ProviderUserDto;
}

export class LinkSocialDto {
  @ApiProperty({ enum: ['google', 'github'] })
  @IsIn(['google', 'github'])
  provider!: 'google' | 'github';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  callbackURL?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  errorCallbackURL?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key],
  )
  @IsBoolean()
  disableRedirect?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key],
  )
  @IsBoolean()
  requestSignUp?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional({ type: IdTokenDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IdTokenDto)
  idToken?: IdTokenDto;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  additionalData?: Record<string, unknown>;
}

export class SocialSignInDto extends LinkSocialDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  newUserCallbackURL?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  loginHint?: string;
}
