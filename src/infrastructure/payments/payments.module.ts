import { Module } from '@nestjs/common';
import { ConnectWebhookQueueModule } from '@/infrastructure/queue/connect-webhook/connect-webhook-queue.module';
import { PAYMENT_GATEWAY } from './payment.tokens';
import { StripeModule } from './stripe/stripe.module';
import { StripePaymentGateway } from './stripe/stripe-payment.gateway';
import { PaymentEventsRepository } from './repos/payment-events.repository';

@Module({
  imports: [StripeModule, ConnectWebhookQueueModule],
  controllers: [],
  providers: [
    StripePaymentGateway,
    { provide: PAYMENT_GATEWAY, useExisting: StripePaymentGateway },
    PaymentEventsRepository,
  ],
  // Re-export the Stripe module so Billing can consume the one shared client
  // without declaring a second provider.
  exports: [
    StripeModule,
    PAYMENT_GATEWAY,
    PaymentEventsRepository,
    ConnectWebhookQueueModule,
  ],
})
export class PaymentInfrastructureModule {}
