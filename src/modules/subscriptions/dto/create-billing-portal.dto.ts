import { ApiProperty } from '@nestjs/swagger';
import { IsUrl } from 'class-validator';

export class CreateBillingPortalDto {
  @ApiProperty({
    description: 'Absolute URL Stripe returns to after portal actions',
    example: 'https://app.example.com/settings/billing',
  })
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  returnUrl!: string;
}
