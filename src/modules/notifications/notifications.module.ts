import { UserNotificationReconciliationTask } from './tasks/user-notification-reconciliation.task';
import { NotificationStreamService } from './services/notification-stream.service';
import { NotificationStreamConnectionsService } from './services/notification-stream-connections.service';
import { NotificationInboxGuard } from './domain/notification-rollout';
import { NotificationOperationsRepository } from './repos/notification-operations.repository';
import { NotificationRetentionTask } from './tasks/notification-retention.task';
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
    UserNotificationReconciliationTask,
    NotificationInboxGuard,
    NotificationOperationsRepository,
    NotificationRetentionTask,
    NotificationStreamService,
    NotificationStreamConnectionsService,
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
