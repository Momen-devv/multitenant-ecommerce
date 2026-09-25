import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddressResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  label!: string;
  @ApiProperty()
  recipientName!: string;
  @ApiProperty({ example: '+201234567890' })
  recipientPhone!: string;
  @ApiProperty()
  addressLine1!: string;
  @ApiPropertyOptional({ nullable: true })
  addressLine2!: string | null;
  @ApiProperty()
  city!: string;
  @ApiPropertyOptional({ nullable: true })
  region!: string | null;
  @ApiPropertyOptional({ nullable: true })
  postalCode!: string | null;
  @ApiProperty({ example: 'EG' })
  countryCode!: string;
  @ApiProperty()
  isDefault!: boolean;
  @ApiProperty()
  createdAt!: Date;
  @ApiProperty()
  updatedAt!: Date;
}

export class AddressListResponseDto {
  @ApiProperty({ type: () => [AddressResponseDto] })
  items!: AddressResponseDto[];
}
