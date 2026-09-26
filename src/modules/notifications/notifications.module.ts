import { Module } from '@nestjs/common';
import { NotificationEventsRepository } from './repos/notification-events.repository';
import { NotificationPreferencesRepository } from './repos/notification-preferences.repository';
import { NotificationsRepository } from './repos/notifications.repository';

@Module({
  providers: [
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
