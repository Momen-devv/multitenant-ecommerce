import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  JobNames,
  QueueNames,
  type StripeWebhookJobName,
} from '../queue.constants';

export type StripeWebhookJobData = { eventId: string } | Record<string, never>;

const RECOVERY_SCHEDULER_ID = JobNames.STRIPE_WEBHOOK.RECOVER_EVENTS;
const RECOVERY_INTERVAL_MS = 30_000;

@Injectable()
export class StripeWebhookQueueService implements OnModuleInit {
  constructor(
    @InjectQueue(QueueNames.STRIPE_WEBHOOK)
    private readonly queue: Queue<
      StripeWebhookJobData,
      void,
      StripeWebhookJobName
    >,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      RECOVERY_SCHEDULER_ID,
      { every: RECOVERY_INTERVAL_MS },
      {
        name: JobNames.STRIPE_WEBHOOK.RECOVER_EVENTS,
        data: {},
        opts: {
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 100 },
        },
      },
    );
  }

  async enqueueEvent(eventId: string): Promise<void> {
    await this.queue.add(
      JobNames.STRIPE_WEBHOOK.PROCESS_EVENT,
      { eventId },
      {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
