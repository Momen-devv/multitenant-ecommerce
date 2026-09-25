import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { StripeConnectWebhookService } from '@/infrastructure/payments/services/stripe-connect-webhook.service';
import {
  ConnectWebhookJobName,
  JobNames,
  QueueNames,
} from '../queue.constants';
import type { ConnectWebhookJobData } from './connect-webhook-queue.service';

@Processor(QueueNames.CONNECT_WEBHOOK)
export class StripeConnectWebhookProcessor extends WorkerHost {
  constructor(private readonly webhookService: StripeConnectWebhookService) {
    super();
  }

  async process(
    job: Job<ConnectWebhookJobData, void, ConnectWebhookJobName>,
  ): Promise<void> {
    switch (job.name) {
      case JobNames.CONNECT_WEBHOOK.PROCESS_EVENT:
        await this.webhookService.processEvent(
          (job.data as { eventId: string }).eventId,
        );
        return;
      case JobNames.CONNECT_WEBHOOK.RECOVER_EVENTS:
        await this.webhookService.recoverDueEvents();
        return;
    }
  }
}
