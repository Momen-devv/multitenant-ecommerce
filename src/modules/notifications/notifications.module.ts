import { NotificationStreamService } from './services/notification-stream.service';
import { NotificationStreamController } from './controllers/notification-stream.controller';
import { Module } from '@nestjs/common';
import { InvitationNotificationReconciliationTask } from './tasks/invitation-notification-reconciliation.task';
import { NotificationEventsRepository } from './repos/notification-events.repository';
import { NotificationPreferencesRepository } from './repos/notification-preferences.repository';
import { NotificationsRepository } from './repos/notifications.repository';
import { NotificationInboxRepository } from './repos/notification-inbox.repository';
import { NotificationsController } from './controllers/notifications.controller';
import { OutboxModule } from '@/infrastructure/outbox/outbox.module';
import { NotificationsQueueModule } from '@/infrastructure/queue/notifications/notifications-queue.module';
import { NotificationsQueueProcessor } from '@/infrastructure/queue/notifications/notifications-queue.processor';
import { NotificationMaterializationService } from './services/notification-materialization.service';
import { NotificationOutboxDispatcher } from './tasks/notification-outbox.dispatcher';
import { NotificationEmailRecoveryTask } from './tasks/notification-email-recovery.task';
import { NotificationEmailDeliveryRepository } from './repos/notification-email-delivery.repository';

@Module({
  imports: [OutboxModule, NotificationsQueueModule],
  controllers: [NotificationStreamController, NotificationsController],
  providers: [
    NotificationStreamService,
    InvitationNotificationReconciliationTask,
    NotificationInboxRepository,
    NotificationEventsRepository,
    NotificationPreferencesRepository,
    NotificationsRepository,
    NotificationMaterializationService,
    NotificationsQueueProcessor,
    NotificationOutboxDispatcher,
    NotificationEmailRecoveryTask,
    NotificationEmailDeliveryRepository,
  ],
  exports: [
    NotificationEventsRepository,
    NotificationPreferencesRepository,
    NotificationsRepository,
  ],
})
export class NotificationsModule {}
