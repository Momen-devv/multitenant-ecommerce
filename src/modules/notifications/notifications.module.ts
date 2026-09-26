import { Module } from '@nestjs/common';
import { NotificationEventsRepository } from './repos/notification-events.repository';
import { NotificationPreferencesRepository } from './repos/notification-preferences.repository';
import { NotificationsRepository } from './repos/notifications.repository';
import { NotificationInboxRepository } from './repos/notification-inbox.repository';
import { NotificationsController } from './controllers/notifications.controller';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationInboxRepository,
    NotificationEventsRepository,
    NotificationPreferencesRepository,
    NotificationsRepository,
  ],
  exports: [
    NotificationEventsRepository,
    NotificationPreferencesRepository,
    NotificationsRepository,
  ],
})
export class NotificationsModule {}
