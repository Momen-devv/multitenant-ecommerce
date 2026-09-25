import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { appConfig } from '@/core/config';
import { OrderEmailDeliveryRepository } from '@/modules/orders/repos/order-email-delivery.repository';
import { OrderEmailType } from '@/modules/orders/domain/order-email-intent';
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
  renderOrderEmail,
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

const orderEmailTypeByJob = {
  [JobNames.EMAIL.ORDER_PLACED]: OrderEmailType.Placed,
  [JobNames.EMAIL.ORDER_SHIPPED]: OrderEmailType.Shipped,
  [JobNames.EMAIL.ORDER_DELIVERED]: OrderEmailType.Delivered,
  [JobNames.EMAIL.ORDER_CANCELLED]: OrderEmailType.Cancelled,
  [JobNames.EMAIL.ORDER_REFUNDED]: OrderEmailType.Refunded,
} satisfies Record<Extract<EmailJobName, `order-${string}`>, OrderEmailType>;

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

      case JobNames.EMAIL.ORDER_PLACED:
      case JobNames.EMAIL.ORDER_SHIPPED:
      case JobNames.EMAIL.ORDER_DELIVERED:
      case JobNames.EMAIL.ORDER_CANCELLED:
      case JobNames.EMAIL.ORDER_REFUNDED:
        await this.sendOrderEmail(
          this.requireDeliveryId(job.data),
          orderEmailTypeByJob[job.name],
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

  private requireDeliveryId(data: EmailJobData): string {
    if (!data.deliveryId)
      throw new Error('Order email job is missing its delivery ID.');
    return data.deliveryId;
  }

  private async sendOrderEmail(
    deliveryId: string,
    type: OrderEmailType,
  ): Promise<void> {
    const claimed = await this.deliveries.claimForSend(deliveryId, type);
    if (!claimed) return;

    try {
      if (claimed.delivery.payload.type !== type)
        throw new Error(
          'Order email delivery type does not match its payload.',
        );
      const orderDetailUrl = new URL(
        `/api/v1/users/me/orders/${encodeURIComponent(claimed.delivery.payload.orderId)}`,
        this.app.baseUrl,
      ).toString();
      const email = renderOrderEmail(claimed.delivery.payload, orderDetailUrl);
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
