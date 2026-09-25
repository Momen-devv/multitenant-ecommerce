import { Module } from '@nestjs/common';
import { CheckoutController } from './controllers/checkout.controller';
import { UserOrdersController } from './controllers/user-orders.controller';
import { StoreOrdersController } from './controllers/store-orders.controller';
import { StoresModule } from '../stores/stores.module';
import { PaymentInfrastructureModule } from '@/infrastructure/payments/payments.module';
import { CheckoutRepository } from './repos/checkout.repository';
import { OrdersRepository } from './repos/orders.repository';
import { OrdersService } from './services/orders.service';
import { CHECKOUT_REPOSITORY, ORDERS_REPOSITORY } from './interfaces';
import { PaymentReconciliationTask } from './tasks/payment-reconciliation.task';
import { RefundOutboxDispatcher } from './tasks/refund-outbox.dispatcher';
import { OrderPurchaseEventHandler } from './services/connect-purchase-event.handler';
import { OutboxModule } from '@/infrastructure/outbox/outbox.module';
import { OrderEmailOutboxDispatcher } from './tasks/order-email-outbox.dispatcher';
import { EmailQueueModule } from '@/infrastructure/queue/email/email-queue.module';
@Module({
  imports: [
    StoresModule,
    PaymentInfrastructureModule,
    OutboxModule,
    EmailQueueModule,
  ],
  controllers: [
    CheckoutController,
    UserOrdersController,
    StoreOrdersController,
  ],
  providers: [
    OrdersService,
    CheckoutRepository,
    OrdersRepository,
    { provide: CHECKOUT_REPOSITORY, useExisting: CheckoutRepository },
    { provide: ORDERS_REPOSITORY, useExisting: OrdersRepository },
    PaymentReconciliationTask,
    RefundOutboxDispatcher,
    OrderEmailOutboxDispatcher,
    OrderPurchaseEventHandler,
  ],
  exports: [
    OrdersService,
    CheckoutRepository,
    CHECKOUT_REPOSITORY,
    ORDERS_REPOSITORY,
    OrderPurchaseEventHandler,
  ],
})
export class OrdersModule {}
