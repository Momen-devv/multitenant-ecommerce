import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export enum StorePaymentConnectionStatus {
  NOT_CONNECTED = 'not_connected',
  CREATING = 'creating',
  ONBOARDING_REQUIRED = 'onboarding_required',
  READY = 'ready',
  RESTRICTED = 'restricted',
  DEAUTHORIZED = 'deauthorized',
  REVIEW_REQUIRED = 'review_required',
}

export class StorePaymentConnectionResponseDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  connected!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  ready!: boolean;

  @ApiProperty({ enum: StorePaymentConnectionStatus, example: 'ready' })
  @IsEnum(StorePaymentConnectionStatus)
  status!: StorePaymentConnectionStatus;

  @ApiProperty({ example: true })
  @IsBoolean()
  chargesEnabled!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  payoutsEnabled!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  cardPaymentsActive!: boolean;

  @ApiProperty({ type: [String], example: [] })
  @IsArray()
  @IsString({ each: true })
  requirementsDue!: string[];

  @ApiProperty({ type: String, nullable: true, example: null })
  @IsOptional()
  @IsString()
  disabledReason!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    example: null,
  })
  @IsOptional()
  @IsDateString()
  checkedAt!: string | null;
}

export class StorePaymentOnboardingResponseDto {
  @ApiProperty({
    format: 'uri',
    example: 'https://connect.stripe.com/setup/s/example',
  })
  @IsString()
  onboardingUrl!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-15T12:05:00.000Z' })
  @IsDateString()
  expiresAt!: string;
}

export class StorePaymentOnboardingRequestDto {}
