import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { AtLeastOneField } from '@/common/decorators';
import { InventoryPolicy } from '@/common/enums';

@AtLeastOneField(['inventoryPolicy', 'onHand'])
export class UpdateProductInventoryDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ enum: InventoryPolicy })
  @IsOptional()
  @IsEnum(InventoryPolicy)
  inventoryPolicy?: InventoryPolicy;

  @ApiPropertyOptional({
    minimum: 0,
    description:
      'Required when switching to tracked inventory. Omit when switching to untracked inventory.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  onHand?: number;
}
