import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { JobNames, QueueNames } from '../queue.constants';
import { Queue } from 'bullmq';
import type { Redis as IORedisClient } from 'ioredis';
import { LoggerService } from '@/infrastructure/logger/logger.service';

@Injectable()
export class EmailQueueService {
  // options for now
  private readonly jobOptions = {
    attempts: 4,
    backoff: { type: 'exponential' as const, delay: 3000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  };

  constructor(
    @InjectQueue(QueueNames.EMAIL) private readonly emailQueue: Queue,
    private readonly logger: LoggerService,
  ) {}
  async addWelcomeJob(to: string, name: string, token: string): Promise<void> {
    await this.emailQueue.add(
      JobNames.EMAIL.WELCOME,
      { to, name, token },
      this.jobOptions,
    );
  }

  async addResetPasswordJob(to: string, url: string): Promise<void> {
    await this.emailQueue.add(
      JobNames.EMAIL.RESET_PASSWORD,
      { to, url },
      this.jobOptions,
    );
  }

  async addVerificationEmailJob(
    to: string,
    url: string,
    token: string,
  ): Promise<void> {
    await this.emailQueue.add(
      JobNames.EMAIL.VERIFICATION,
      { to, url, token },
      this.jobOptions,
    );
  }

  async addAccountDeactivatedJob(to: string): Promise<void> {
    await this.emailQueue.add(
      JobNames.EMAIL.ACCOUNT_DEACTIVATED,
      { to },
      this.jobOptions,
    );
  }

  async addAccountReactivationJob(to: string, url: string): Promise<void> {
    await this.emailQueue.add(
      JobNames.EMAIL.ACCOUNT_REACTIVATION,
      { to, url },
      this.jobOptions,
    );
  }

  // Any other email-related jobs can be added here

  async pingCheck(): Promise<boolean> {
    try {
      const client = (await this.emailQueue.client) as unknown as IORedisClient;
      const pong = await client.ping();
      return pong === 'PONG';
    } catch (error) {
      this.logger.error(
        'Email queue ping failed',
        error,
        EmailQueueService.name,
      );
      return false;
    }
  }
}
