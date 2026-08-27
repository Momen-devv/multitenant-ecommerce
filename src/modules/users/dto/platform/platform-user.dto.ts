import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AuthRole } from '@/common/enums';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export enum PlatformUserSearchField {
  EMAIL = 'email',
  NAME = 'name',
}

export enum PlatformUserSortField {
  CREATED_AT = 'createdAt',
  EMAIL = 'email',
  NAME = 'name',
}

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListPlatformUsersDto {
  @ApiPropertyOptional({ description: 'Search text for a user name or email' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  searchValue?: string;

  @ApiPropertyOptional({ enum: PlatformUserSearchField, default: 'email' })
  @IsOptional()
  @IsEnum(PlatformUserSearchField)
  searchField?: PlatformUserSearchField;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  offset: number = 0;

  @ApiPropertyOptional({ enum: PlatformUserSortField, default: 'createdAt' })
  @IsOptional()
  @IsEnum(PlatformUserSortField)
  sortBy: PlatformUserSortField = PlatformUserSortField.CREATED_AT;

  @ApiPropertyOptional({ enum: SortDirection, default: 'desc' })
  @IsOptional()
  @IsEnum(SortDirection)
  sortDirection: SortDirection = SortDirection.DESC;
}

export class CreatePlatformUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(trim)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'Jane Doe' })
  @Transform(trim)
  @IsString()
  @Length(3, 100)
  name!: string;

  @ApiProperty({ minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(8, 128)
  password!: string;

  @ApiPropertyOptional({ enum: AuthRole, default: AuthRole.USER })
  @IsOptional()
  @IsEnum(AuthRole)
  role: AuthRole = AuthRole.USER;

  @ApiProperty({ description: 'Why this account is being created' })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class UpdatePlatformUserDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(3, 100)
  name?: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @Transform(trim)
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiProperty({ description: 'Why this profile is being changed' })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class SetPlatformUserRoleDto {
  @ApiProperty({ enum: AuthRole })
  @IsEnum(AuthRole)
  role!: AuthRole;

  @ApiProperty({ description: 'Why this role is being assigned' })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class BanPlatformUserDto {
  @ApiProperty({ description: 'Why this user is being banned' })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    description: 'Ban duration in seconds; omit for a permanent ban',
    minimum: 60,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(31_536_000)
  expiresIn?: number;
}

export class PlatformUserReasonDto {
  @ApiProperty({ description: 'Reason for this administrative action' })
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
