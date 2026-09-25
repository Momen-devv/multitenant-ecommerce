import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SmsService } from '@/common/abstracts';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { JobNames, QueueNames, type SmsJobName } from '../queue.constants';

type SmsJobData = {
  to: string;
  body: string;
};

@Processor(QueueNames.SMS)
export class SmsQueueProcessor extends WorkerHost {
  constructor(
    private readonly smsService: SmsService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<SmsJobData, unknown, SmsJobName>): Promise<void> {
    switch (job.name) {
      case JobNames.SMS.SEND:
        await this.smsService.sendSms(job.data.to, job.data.body);
        break;
      default: {
        const _exhaustiveCheck: never = job.name;
        this.logger.warn(
          `No handler for job name: ${String(_exhaustiveCheck)}`,
        );
      }
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<SmsJobData, unknown, SmsJobName>): void {
    this.logger.log(
      `SMS job completed. Job ID: ${job.id} Name: ${job.name} for ${job.data.to}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<SmsJobData, unknown, SmsJobName>, error: Error): void {
    this.logger.error(
      `SMS job failed. Job ID: ${job.id} Name: ${job.name} for ${job.data.to}. Error: ${error.message}`,
      error.stack,
    );
  }
}
