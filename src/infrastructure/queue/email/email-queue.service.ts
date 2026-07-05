import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { JobNames, QueueNames } from '../queue.constants';
import { Queue } from 'bullmq';

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

  // Any other email-related jobs can be added here
}
