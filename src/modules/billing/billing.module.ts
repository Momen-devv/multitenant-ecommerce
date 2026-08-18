import { Module } from '@nestjs/common';
import { BillingCatalogService } from './billing-catalog.service';
import { BillingCheckoutService } from './billing-checkout.service';
import { BillingPortalService } from './billing-portal.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';
import { StripeModule } from './stripe/stripe.module';

@Module({
  imports: [StripeModule],
  controllers: [StripeWebhookController],
  providers: [
    BillingCatalogService,
    BillingCheckoutService,
    BillingPortalService,
    StripeWebhookService,
  ],
  exports: [
    BillingCatalogService,
    BillingCheckoutService,
    BillingPortalService,
  ],
})
export class BillingModule {}
