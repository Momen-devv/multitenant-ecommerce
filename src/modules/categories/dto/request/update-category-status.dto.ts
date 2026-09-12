import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Min } from 'class-validator';
import { CategoryStatus } from '@/common/enums';

export class UpdateCategoryStatusDto {
  @ApiProperty({ enum: [CategoryStatus.DRAFT, CategoryStatus.PUBLISHED] })
  @IsIn([CategoryStatus.DRAFT, CategoryStatus.PUBLISHED])
  status!: CategoryStatus.DRAFT | CategoryStatus.PUBLISHED;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
