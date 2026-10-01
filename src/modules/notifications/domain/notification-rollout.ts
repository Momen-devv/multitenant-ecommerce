import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { notificationConfig } from '@/core/config';

@Injectable()
export class NotificationInboxGuard implements CanActivate {
  constructor(
    @Inject(notificationConfig.KEY)
    private readonly config: ConfigType<typeof notificationConfig>,
  ) {}

  canActivate() {
    if (!this.config.inboxEnabled)
      throw new ServiceUnavailableException(
        'Notifications temporarily unavailable',
      );
    return true;
  }
}
