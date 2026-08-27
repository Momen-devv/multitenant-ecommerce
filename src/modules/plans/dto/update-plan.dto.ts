import {
  IsBooleanRecord,
  IsNonNegativeIntegerRecord,
} from '@/common/decorators/record-validation.decorator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsObject, IsOptional, IsString, Length } from 'class-validator';

export class UpdatePlanDto {
  @ApiPropertyOptional({
    description: 'Display name of the plan',
    example: 'Professional',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Plan description. Send null to clear it.',
    example: 'For growing businesses',
    maxLength: 500,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Length(2, 500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Replacement feature flags for the plan',
    type: 'object',
    additionalProperties: { type: 'boolean' },
  })
  @IsOptional()
  @IsObject()
  @IsBooleanRecord()
  features?: Record<string, boolean>;

  @ApiPropertyOptional({
    description: 'Replacement usage limits for the plan',
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  @IsOptional()
  @IsObject()
  @IsNonNegativeIntegerRecord()
  limits?: Record<string, number>;
}
