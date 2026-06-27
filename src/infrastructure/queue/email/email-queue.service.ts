import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { JobNames, QueueNames } from '../queue.constants';
import { Queue } from 'bullmq';

@Injectable()
export class EmailQueueService {
  constructor(
    @InjectQueue(QueueNames.EMAIL) private readonly emailQueue: Queue,
  ) {}
  async addWelcomeJob(to: string, name: string, token: string) {
    await this.emailQueue.add(JobNames.EMAIL.WELCOME, { to, name, token });
  }

  async addResetPasswordJob(to: string, url: string) {
    await this.emailQueue.add(JobNames.EMAIL.RESET_PASSWORD, { to, url });
  }

  async addVerificationEmailJob(to: string, url: string, token: string) {
    await this.emailQueue.add(JobNames.EMAIL.VERIFICATION, {
      to,
      url,
      token,
    });
  }

  // Any other email-related jobs can be added here
}
