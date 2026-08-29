import { Module } from '@nestjs/common';
import { StripeWebhookQueueModule } from '@/infrastructure/queue/stripe-webhook/stripe-webhook-queue.module';
import { StripeWebhookProcessor } from '@/infrastructure/queue/stripe-webhook/stripe-webhook.processor';
import { StripeWebhookController } from './controllers/stripe-webhook.controller';
import { BillingRepository } from './repos/billing.repository';
import { BILLING_REPOSITORY } from './interfaces/repos';
import { BillingCatalogService } from './services/billing-catalog.service';
import { BillingCheckoutService } from './services/billing-checkout.service';
import { BillingPortalService } from './services/billing-portal.service';
import { StripeWebhookService } from './services/stripe-webhook.service';
import { StripeModule } from './stripe/stripe.module';

@Module({
  imports: [StripeModule, StripeWebhookQueueModule],
  controllers: [StripeWebhookController],
  providers: [
    BillingCatalogService,
    BillingRepository,
    { provide: BILLING_REPOSITORY, useExisting: BillingRepository },
    BillingCheckoutService,
    BillingPortalService,
    StripeWebhookService,
    StripeWebhookProcessor,
  ],
  exports: [
    BillingCatalogService,
    BillingCheckoutService,
    BillingPortalService,
    StripeWebhookService,
  ],
})
export class BillingModule {}
