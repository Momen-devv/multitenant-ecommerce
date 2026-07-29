import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  JobNames,
  QueueNames,
  type EmailJobName,
} from '@/infrastructure/queue/queue.constants';
import { MailService } from '@/common/abstracts';
import { LoggerService } from '../../logger/logger.service';

import {
  welcomeTemplate,
  resetPasswordTemplate,
  accountDeactivatedTemplate,
  accountReactivationTemplate,
} from '@/infrastructure/mail/templates';
import { verificationEmailTemplate } from '@/infrastructure/mail/templates';

type EmailJobData = {
  to: string;
  subject: string;
  name?: string;
  url?: string;
  token?: string;
};

@Processor(QueueNames.EMAIL)
export class EmailQueueProcessor extends WorkerHost {
  constructor(
    private readonly mailService: MailService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<EmailJobData, any, EmailJobName>) {
    switch (job.name) {
      case JobNames.EMAIL.WELCOME:
        await this.mailService.sendEmail(
          job.data.to,
          'Welcome!',
          welcomeTemplate(job.data.name!),
        );
        break;

      case JobNames.EMAIL.RESET_PASSWORD:
        await this.mailService.sendEmail(
          job.data.to,
          'Reset Password',
          resetPasswordTemplate(job.data.url!),
        );
        break;

      case JobNames.EMAIL.VERIFICATION:
        await this.mailService.sendEmail(
          job.data.to,
          'Verify your email',
          verificationEmailTemplate(job.data.url!),
        );
        break;

      case JobNames.EMAIL.ACCOUNT_DEACTIVATED:
        await this.mailService.sendEmail(
          job.data.to,
          'Account Deactivated',
          accountDeactivatedTemplate(),
        );
        break;

      case JobNames.EMAIL.ACCOUNT_REACTIVATION:
        await this.mailService.sendEmail(
          job.data.to,
          'Account Reactivation',
          accountReactivationTemplate(job.data.url!),
        );
        break;

      // Any other email-related jobs can be handled here

      default: {
        const _exhaustiveCheck: never = job.name;
        this.logger.warn(
          `No handler for job name: ${String(_exhaustiveCheck)}`,
        );
        break;
      }
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<EmailJobData, any, EmailJobName>) {
    this.logger.log(
      `Email job completed. Job ID: ${job.id} Name: ${job.name} for ${job.data.to}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<EmailJobData, any, EmailJobName>, error: Error) {
    this.logger.error(
      `Email job failed. Job ID: ${job.id} Name: ${job.name} for ${job.data.to}. Error: ${error.message}`,
      error.stack,
    );
  }
}
