import { ApiProperty } from '@nestjs/swagger';
import { IsUrl, IsUUID } from 'class-validator';

const HTTP_URL_OPTIONS = {
  protocols: ['http', 'https'],
  require_protocol: true,
  require_tld: false,
};

export class CreateSubscriptionCheckoutDto {
  @ApiProperty({ description: 'Application plan-price ID', format: 'uuid' })
  @IsUUID()
  planPriceId!: string;

  @ApiProperty({
    description: 'Absolute URL Stripe redirects to after successful checkout',
    example: 'https://app.example.com/settings/billing?checkout=success',
  })
  @IsUrl(HTTP_URL_OPTIONS)
  successUrl!: string;

  @ApiProperty({
    description: 'Absolute URL Stripe redirects to after canceled checkout',
    example: 'https://app.example.com/settings/billing?checkout=canceled',
  })
  @IsUrl(HTTP_URL_OPTIONS)
  cancelUrl!: string;
}
