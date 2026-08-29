import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { PlanProvisioningQueueService } from '@/infrastructure/queue/plan-provisioning/plan-provisioning-queue.service';
import {
  PLATFORM_PLANS_REPOSITORY,
  type IPlatformPlansRepository,
} from '../interfaces/repos';

const RECONCILIATION_INTERVAL_MS = 60_000;
const PENDING_STALE_AFTER_MS = 60_000;
const PROCESSING_STALE_AFTER_MS = 15 * 60_000;
const RECONCILIATION_BATCH_SIZE = 50;

@Injectable()
export class PlanProvisioningReconciler {
  private isReconciling = false;

  constructor(
    @Inject(PLATFORM_PLANS_REPOSITORY)
    private readonly plansRepository: IPlatformPlansRepository,
    private readonly queue: PlanProvisioningQueueService,
    private readonly logger: LoggerService,
  ) {}

  @Interval('plan-provisioning-reconciliation', RECONCILIATION_INTERVAL_MS)
  async reconcile(): Promise<void> {
    if (this.isReconciling) return;

    this.isReconciling = true;
    try {
      const now = Date.now();
      const candidates =
        await this.plansRepository.findProvisioningRecoveryCandidates({
          pendingBefore: new Date(now - PENDING_STALE_AFTER_MS),
          processingBefore: new Date(now - PROCESSING_STALE_AFTER_MS),
          limit: RECONCILIATION_BATCH_SIZE,
        });

      for (const candidate of candidates) {
        try {
          await this.queue.retryProvisionPlanJob(candidate);
        } catch (error) {
          this.logger.error(
            `Failed to reconcile provisioning for plan ${candidate.planId}`,
            error,
            PlanProvisioningReconciler.name,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Failed to load plan provisioning recovery candidates',
        error,
        PlanProvisioningReconciler.name,
      );
    } finally {
      this.isReconciling = false;
    }
  }
}
