import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import {
  JobNames,
  type PlanProvisioningJobName,
  QueueNames,
} from '../queue.constants';

export type ProvisionPlanJobData = {
  planId: string;
  provisioningVersion: number;
};

@Injectable()
export class PlanProvisioningQueueService {
  private readonly jobOptions = {
    attempts: 8,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  } satisfies JobsOptions;

  constructor(
    @InjectQueue(QueueNames.PLAN_PROVISIONING)
    private readonly queue: Queue<
      ProvisionPlanJobData,
      void,
      PlanProvisioningJobName
    >,
  ) {}

  async addProvisionPlanJob(data: ProvisionPlanJobData): Promise<void> {
    await this.queue.add(JobNames.PLAN_PROVISIONING.PROVISION_PLAN, data, {
      ...this.jobOptions,
      jobId: this.getJobId(data),
    });
  }

  async retryProvisionPlanJob(data: ProvisionPlanJobData): Promise<void> {
    const jobId = this.getJobId(data);
    const existingJob = await this.queue.getJob(jobId);

    if (!existingJob) {
      await this.addProvisionPlanJob(data);
      return;
    }

    const state = await existingJob.getState();
    if (state === 'unknown') {
      await this.addProvisionPlanJob(data);
      return;
    }

    if (state === 'failed' || state === 'completed') {
      await existingJob.retry(state, {
        resetAttemptsMade: true,
        resetAttemptsStarted: true,
      });
    }
  }

  private getJobId(data: ProvisionPlanJobData): string {
    return `provision-plan-${data.planId}-v${data.provisioningVersion}`;
  }
}
