import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import {
  ConnectWebhookJobName,
  JobNames,
  QueueNames,
} from '../queue.constants';

export type ConnectWebhookJobData = { eventId: string } | Record<string, never>;

@Injectable()
export class ConnectWebhookQueueService implements OnModuleInit {
  private readonly jobOptions = {
    attempts: 1,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  } satisfies JobsOptions;

  constructor(
    @InjectQueue(QueueNames.CONNECT_WEBHOOK)
    private readonly queue: Queue<
      ConnectWebhookJobData,
      void,
      ConnectWebhookJobName
    >,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      JobNames.CONNECT_WEBHOOK.RECOVER_EVENTS,
      { every: 60_000 },
      {
        name: JobNames.CONNECT_WEBHOOK.RECOVER_EVENTS,
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
      JobNames.CONNECT_WEBHOOK.PROCESS_EVENT,
      { eventId },
      // The durable receipt/lease is the idempotency boundary. A fresh queue
      // job id lets the recovery sweep re-enqueue a failed event.
      { ...this.jobOptions },
    );
  }
}
