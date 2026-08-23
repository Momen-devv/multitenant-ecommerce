import { Module } from '@nestjs/common';
import { BillingCatalogService } from './services/billing-catalog.service';
import { BillingCheckoutService } from './services/billing-checkout.service';
import { BillingPortalService } from './services/billing-portal.service';
import { BillingRepository } from './repos/billing.repository';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';
import { StripeModule } from './stripe/stripe.module';

@Module({
  imports: [StripeModule],
  controllers: [StripeWebhookController],
  providers: [
    BillingCatalogService,
    BillingRepository,
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
