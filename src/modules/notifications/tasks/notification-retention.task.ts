import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { NotificationOperationsRepository } from '../repos/notification-operations.repository';
import { NotificationStreamService } from '../services/notification-stream.service';

@Injectable()
export class NotificationRetentionTask {
  private running = false;
  constructor(
    private readonly operations: NotificationOperationsRepository,
    private readonly stream: NotificationStreamService,
    private readonly logger: LoggerService,
  ) {}

  @Interval('notification-operations', 60_000)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const cleanup = await this.operations.cleanup();
      this.logger.log(
        'Notification operations snapshot',
        NotificationRetentionTask.name,
        {
          cleanup,
          work: await this.operations.metrics(),
          sseConnections: this.stream.connectionCount,
        },
      );
    } catch (error) {
      this.logger.error(
        'Notification operations failed',
        error,
        NotificationRetentionTask.name,
      );
    } finally {
      this.running = false;
    }
  }
}
