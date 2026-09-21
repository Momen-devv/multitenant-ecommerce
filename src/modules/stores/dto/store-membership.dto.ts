import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OrganizationRole } from '@/common/enums';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListStoreMembersDto {
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
}

export class InviteStoreMemberDto {
  @ApiProperty({ example: 'staff@example.com' })
  @Transform(trim)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ enum: [OrganizationRole.MANAGER, OrganizationRole.SUPPORT] })
  @IsEnum(OrganizationRole)
  role!: OrganizationRole.MANAGER | OrganizationRole.SUPPORT;
}

export class UpdateStoreMemberRoleDto {
  @ApiProperty({ enum: OrganizationRole })
  @IsEnum(OrganizationRole)
  role!: OrganizationRole;
}
