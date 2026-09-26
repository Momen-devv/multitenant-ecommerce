import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  notificationCatalog,
  type NotificationAudience,
  type NotificationEventType,
} from '../domain/notification-policy';

export class NotificationScopeDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  storeId?: string;
}

export class NotificationListDto extends NotificationScopeDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({
    description: 'Opaque cursor bound to the current filters and User',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;

  @ApiPropertyOptional({ enum: Object.keys(notificationCatalog) })
  @IsOptional()
  @IsIn(Object.keys(notificationCatalog))
  type?: NotificationEventType;

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'Omit for both read and unread',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  unread?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], default: 'false' })
  @IsOptional()
  @IsIn(['true', 'false'])
  archived?: string;
}

export class NotificationArchiveDto {
  @ApiProperty({
    description: 'true archives; false restores an undeleted item',
  })
  @IsBoolean()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.archived)
  archived!: boolean;
}

export class NotificationPreferenceItemDto {
  @ApiProperty({ enum: Object.keys(notificationCatalog) })
  @IsIn(Object.keys(notificationCatalog))
  eventType!: NotificationEventType;

  @ApiProperty({
    enum: [
      'user',
      'customer',
      'staff',
      'storeOwner',
      'invitee',
      'inviter',
      'admin',
    ],
  })
  @IsIn([
    'user',
    'customer',
    'staff',
    'storeOwner',
    'invitee',
    'inviter',
    'admin',
  ])
  audience!: NotificationAudience;

  @ApiProperty({
    type: Boolean,
    nullable: true,
    description: 'null removes the override and restores inheritance',
  })
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsBoolean()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.emailEnabled)
  emailEnabled!: boolean | null;
}

export class NotificationDisplayDto {
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
}

export class NotificationResourceDto {
  @ApiProperty({
    enum: [
      'order',
      'invitation',
      'store',
      'subscription',
      'account',
      'operations',
    ],
  })
  kind!: string;
  @ApiProperty() id!: string;
}

export class NotificationMessageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) storeId!:
    | string
    | null;
  @ApiProperty({ enum: Object.keys(notificationCatalog) })
  type!: NotificationEventType;
  @ApiProperty({ type: NotificationDisplayDto })
  display!: NotificationDisplayDto;
  @ApiProperty({ type: NotificationResourceDto })
  resource!: NotificationResourceDto;
  @ApiProperty({ type: String, format: 'date-time' }) occurredAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  archivedAt!: Date | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Current invitation state; null when unavailable or not an invitation',
  })
  invitationStatus!: string | null;
}

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationMessageDto] })
  items!: NotificationMessageDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class NotificationCountDto {
  @ApiProperty() count!: number;
}

export class NotificationMutationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}

export class NotificationPreferenceResultDto {
  @ApiProperty({ enum: Object.keys(notificationCatalog) })
  eventType!: NotificationEventType;
  @ApiProperty() audience!: NotificationAudience;
  @ApiProperty() mandatory!: boolean;
  @ApiProperty() storeScoped!: boolean;
  @ApiProperty() defaultEmailEnabled!: boolean;
  @ApiProperty({ type: Boolean, nullable: true }) globalOverride!:
    | boolean
    | null;
  @ApiProperty({ type: Boolean, nullable: true }) storeOverride!:
    | boolean
    | null;
  @ApiProperty() emailEnabled!: boolean;
}

export class NotificationPreferencesResultDto {
  @ApiProperty({ type: [NotificationPreferenceResultDto] })
  items!: NotificationPreferenceResultDto[];
}

export class NotificationPreferencesUpdatedDto {
  @ApiProperty() updated!: number;
}

export class NotificationPreferencesDto extends NotificationScopeDto {
  @ApiProperty({
    type: [NotificationPreferenceItemDto],
    minItems: 1,
    maxItems: 100,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  updates!: NotificationPreferenceItemDto[];
}
