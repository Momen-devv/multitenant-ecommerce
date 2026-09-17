import { Module } from '@nestjs/common';
import { PaymentInfrastructureModule } from '@/infrastructure/payments/payments.module';
import { CONNECT_ACCOUNT_EVENT_HANDLER } from '@/infrastructure/payments/connect-account-event-handler';
import { CONNECT_PURCHASE_EVENT_HANDLER } from '@/infrastructure/payments/connect-purchase-event-handler';
import { StripeConnectWebhookService } from '@/infrastructure/payments/services/stripe-connect-webhook.service';
import { StripeConnectWebhookController } from '@/infrastructure/payments/controllers/stripe-connect-webhook.controller';
import { StorePaymentAccountsRepository } from './repos/store-payment-accounts.repository';
import { StorePaymentsService } from './services/store-payments.service';
import { StorePaymentsController } from './controllers/store-payments.controller';
import { StorePaymentCreationRecoveryTask } from './tasks/store-payment-creation-recovery.task';
import { StripeConnectWebhookProcessor } from '@/infrastructure/queue/connect-webhook/connect-webhook.processor';
import { StoresModule } from '@/modules/stores/stores.module';
import { STORE_PAYMENT_READINESS_READER } from './interfaces';
import { OrdersModule } from '@/modules/orders/orders.module';
import { CheckoutRepository } from '@/modules/orders/repos/checkout.repository';

@Module({
  imports: [PaymentInfrastructureModule, StoresModule, OrdersModule],
  controllers: [StorePaymentsController, StripeConnectWebhookController],
  providers: [
    StorePaymentAccountsRepository,
    StorePaymentsService,
    {
      provide: STORE_PAYMENT_READINESS_READER,
      useExisting: StorePaymentsService,
    },
    {
      provide: CONNECT_ACCOUNT_EVENT_HANDLER,
      useExisting: StorePaymentsService,
    },
    {
      provide: CONNECT_PURCHASE_EVENT_HANDLER,
      useExisting: CheckoutRepository,
    },
    StripeConnectWebhookService,
    StripeConnectWebhookProcessor,
    StorePaymentCreationRecoveryTask,
  ],
  exports: [StorePaymentsService, STORE_PAYMENT_READINESS_READER],
})
export class PaymentsModule {}
