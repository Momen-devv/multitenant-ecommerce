import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { StripeWebhookService } from '@/modules/billing/services/stripe-webhook.service';
import {
  JobNames,
  QueueNames,
  type StripeWebhookJobName,
} from '../queue.constants';
import type { StripeWebhookJobData } from './stripe-webhook-queue.service';

@Processor(QueueNames.STRIPE_WEBHOOK)
export class StripeWebhookProcessor extends WorkerHost {
  constructor(private readonly webhookService: StripeWebhookService) {
    super();
  }

  async process(
    job: Job<StripeWebhookJobData, void, StripeWebhookJobName>,
  ): Promise<void> {
    switch (job.name) {
      case JobNames.STRIPE_WEBHOOK.PROCESS_EVENT:
        await this.webhookService.processEvent(
          (job.data as { eventId: string }).eventId,
        );
        return;
      case JobNames.STRIPE_WEBHOOK.RECOVER_EVENTS:
        await this.webhookService.recoverDueEvents();
        return;
    }
  }
}
