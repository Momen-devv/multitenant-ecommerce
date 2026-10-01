import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { notificationConfig } from '@/core/config';
import { EmailQueueService } from '@/infrastructure/queue/email/email-queue.service';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { NotificationEmailDeliveryRepository } from '../repos/notification-email-delivery.repository';

@Injectable()
export class NotificationEmailRecoveryTask {
  private running = false;
  constructor(
    private readonly deliveries: NotificationEmailDeliveryRepository,
    private readonly queue: EmailQueueService,
    private readonly logger: LoggerService,
    @Inject(notificationConfig.KEY)
    private readonly config: ConfigType<typeof notificationConfig>,
  ) {}

  @Interval('notification-email-recovery', 10_000)
  async recover() {
    if (!this.config.emailEnabled) return;
    if (this.running) return;
    this.running = true;
    try {
      for (const row of await this.deliveries.reserveDue()) {
        try {
          await this.queue.addNotificationJob(row.id, row.enqueueGeneration);
        } catch {
          await this.deliveries.releaseEnqueue(row.id, row.enqueueGeneration);
        }
      }
    } catch {
      this.logger.error(
        'Notification email recovery failed',
        undefined,
        NotificationEmailRecoveryTask.name,
      );
    } finally {
      this.running = false;
    }
  }
}
