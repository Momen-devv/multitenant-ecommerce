import { Module } from '@nestjs/common';
import { EmailQueueService } from './email-queue.service';
import { QueueNames } from '../queue.constants';
import { BullModule } from '@nestjs/bullmq';
import { MailModule } from '@/infrastructure/mail/mail.module';
import { EmailQueueProcessor } from './email-queue.processor';
import { OrderEmailDeliveryRepository } from '@/modules/orders/repos/order-email-delivery.repository';
import { NotificationEmailDeliveryRepository } from '@/modules/notifications/repos/notification-email-delivery.repository';
import { NotificationPreferencesRepository } from '@/modules/notifications/repos/notification-preferences.repository';
import { NotificationRecipientPolicyService } from '@/modules/notifications/services/notification-recipient-policy.service';
import { NotificationEmailDeliveryService } from '@/modules/notifications/services/notification-email-delivery.service';

@Module({
  imports: [BullModule.registerQueue({ name: QueueNames.EMAIL }), MailModule],
  providers: [
    EmailQueueService,
    EmailQueueProcessor,
    OrderEmailDeliveryRepository,
    NotificationEmailDeliveryRepository,
    NotificationPreferencesRepository,
    NotificationRecipientPolicyService,
    NotificationEmailDeliveryService,
  ],
  exports: [EmailQueueService, OrderEmailDeliveryRepository],
})
export class EmailQueueModule {}
