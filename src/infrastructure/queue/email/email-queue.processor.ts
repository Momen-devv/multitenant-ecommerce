import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  JobNames,
  QueueNames,
  type EmailJobName,
} from '@/infrastructure/queue/queue.constants';
import { MailService } from '@/common/abstracts';
import { LoggerService } from '../../logger/logger.service';
import { appConfig } from '@/core/config';
import type { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { orderEmailTemplate } from '@/infrastructure/mail/templates';
import { OrderEmailDeliveryRepository } from './order-email-delivery.repository';

import {
  welcomeTemplate,
  resetPasswordTemplate,
  accountDeactivatedTemplate,
  accountReactivationTemplate,
} from '@/infrastructure/mail/templates';
import { verificationEmailTemplate } from '@/infrastructure/mail/templates';

type EmailJobData = {
  to?: string;
  subject?: string;
  name?: string;
  url?: string;
  token?: string;
  deliveryId?: string;
};

@Processor(QueueNames.EMAIL)
export class EmailQueueProcessor extends WorkerHost {
  constructor(
    private readonly mailService: MailService,
    private readonly logger: LoggerService,
    private readonly deliveries: OrderEmailDeliveryRepository,
    @Inject(appConfig.KEY)
    private readonly app: ConfigType<typeof appConfig>,
  ) {
    super();
  }

  async process(job: Job<EmailJobData, unknown, EmailJobName>) {
    switch (job.name) {
      case JobNames.EMAIL.WELCOME:
        await this.mailService.sendEmail(
          job.data.to!,
          'Welcome!',
          welcomeTemplate(job.data.name!),
        );
        break;

      case JobNames.EMAIL.RESET_PASSWORD:
        await this.mailService.sendEmail(
          job.data.to!,
          'Reset Password',
          resetPasswordTemplate(job.data.url!),
        );
        break;

      case JobNames.EMAIL.VERIFICATION:
        await this.mailService.sendEmail(
          job.data.to!,
          'Verify your email',
          verificationEmailTemplate(job.data.url!),
        );
        break;

      case JobNames.EMAIL.ACCOUNT_DEACTIVATED:
        await this.mailService.sendEmail(
          job.data.to!,
          'Account Deactivated',
          accountDeactivatedTemplate(),
        );
        break;

      case JobNames.EMAIL.ACCOUNT_REACTIVATION:
        await this.mailService.sendEmail(
          job.data.to!,
          'Account Reactivation',
          accountReactivationTemplate(job.data.url!),
        );
        break;

      case JobNames.EMAIL.ORDER:
        if (!job.data.deliveryId)
          throw new Error('Order email job is missing its delivery ID.');
        await this.sendOrderEmail(job.data.deliveryId);
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

  private async sendOrderEmail(deliveryId: string): Promise<void> {
    const claimed = await this.deliveries.claimForSend(deliveryId);
    if (!claimed) return;

    try {
      const orderDetailUrl = new URL(
        `/api/v1/users/me/orders/${encodeURIComponent(claimed.delivery.payload.orderId)}`,
        this.app.baseUrl,
      ).toString();
      const email = orderEmailTemplate(
        claimed.delivery.payload,
        orderDetailUrl,
      );
      const sent = await this.mailService.sendEmail(
        claimed.delivery.recipientEmail,
        email.subject,
        email.html,
        { idempotencyKey: claimed.delivery.providerIdempotencyKey },
      );
      await this.deliveries.markSent(
        claimed.delivery.id,
        claimed.leaseToken,
        sent.providerMessageId,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await this.deliveries.rescheduleAfterFailure(
          claimed.delivery.id,
          claimed.leaseToken,
          message,
        );
      } catch (persistenceError) {
        this.logger.error(
          `Could not persist order email failure for ${deliveryId}`,
          persistenceError instanceof Error
            ? persistenceError.stack
            : String(persistenceError),
          EmailQueueProcessor.name,
        );
        throw persistenceError;
      }
      this.logger.error(
        `Order email delivery failed for ${deliveryId}`,
        error instanceof Error ? error.stack : String(error),
        EmailQueueProcessor.name,
      );
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<EmailJobData, unknown, EmailJobName>) {
    this.logger.log(
      `Email job completed. Job ID: ${job.id} Name: ${job.name} for ${job.data.to}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<EmailJobData, unknown, EmailJobName>, error: Error) {
    this.logger.error(
      `Email job failed. Job ID: ${job.id} Name: ${job.name} for ${job.data.to}. Error: ${error.message}`,
      error.stack,
    );
  }
}
