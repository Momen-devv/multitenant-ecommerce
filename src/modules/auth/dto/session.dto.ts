import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsString, IsNotEmpty } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class SessionQueryDto {
  @ApiPropertyOptional({})
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  disableCookieCache?: boolean;

  @ApiPropertyOptional({})
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  disableRefresh?: boolean;
}

export class RevokeSessionDto {
  @ApiProperty({})
  @IsString()
  @IsNotEmpty()
  token!: string;
}

/** No writable additional session fields are configured yet. */
export class UpdateSessionDto {}
