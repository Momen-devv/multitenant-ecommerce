import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';

export const notificationEnabled = (flag: string) =>
  process.env[flag] !== 'false';

@Injectable()
export class NotificationInboxGuard implements CanActivate {
  canActivate() {
    if (!notificationEnabled('NOTIFICATION_INBOX_ENABLED'))
      throw new ServiceUnavailableException(
        'Notifications temporarily unavailable',
      );
    return true;
  }
}
