import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { EmailQueueService } from '@/infrastructure/queue/email/email-queue.service';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { withTimeout } from '@/common/utils/with-timeout';

@Injectable()
export class BullMqHealthIndicator {
  constructor(
    private readonly emailQueue: EmailQueueService,
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly logger: LoggerService,
  ) {}

  async pingCheck(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    try {
      const isHealthy = await withTimeout(
        this.emailQueue.pingCheck(),
        3000,
        'BullMQ ping timeout',
      );
      if (!isHealthy) {
        return indicator.down({ message: 'Queue did not respond' });
      }
      return indicator.up();
    } catch (error) {
      this.logger.error(
        `${key} health check failed`,
        error,
        BullMqHealthIndicator.name,
      );
      return indicator.down({ message: 'Queue connection failed' });
    }
  }
}
