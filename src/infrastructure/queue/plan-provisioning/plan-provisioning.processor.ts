import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { BillingInterval, PlanProvisioningStatus } from '@/common/enums';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { BillingCatalogService } from '@/modules/billing/services/billing-catalog.service';
import {
  PLATFORM_PLANS_REPOSITORY,
  type IPlatformPlansRepository,
} from '@/modules/plans/interfaces/repos';
import { Inject } from '@nestjs/common';
import {
  JobNames,
  type PlanProvisioningJobName,
  QueueNames,
} from '../queue.constants';
import type { ProvisionPlanJobData } from './plan-provisioning-queue.service';

@Processor(QueueNames.PLAN_PROVISIONING)
export class PlanProvisioningProcessor extends WorkerHost {
  constructor(
    @Inject(PLATFORM_PLANS_REPOSITORY)
    private readonly plansRepository: IPlatformPlansRepository,
    private readonly billingCatalog: BillingCatalogService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(
    job: Job<ProvisionPlanJobData, void, PlanProvisioningJobName>,
  ): Promise<void> {
    switch (job.name) {
      case JobNames.PLAN_PROVISIONING.PROVISION_PLAN:
        await this.provisionPlan(job.data);
        return;

      default: {
        const _exhaustiveCheck: never = job.name;
        this.logger.warn(
          `No handler for plan provisioning job: ${String(_exhaustiveCheck)}`,
          PlanProvisioningProcessor.name,
        );
      }
    }
  }

  private async provisionPlan(data: ProvisionPlanJobData): Promise<void> {
    const plan = await this.plansRepository.findForProvisioning(data.planId);

    if (!plan) {
      throw new UnrecoverableError(`Plan ${data.planId} was not found`);
    }

    if (plan.provisioningVersion !== data.provisioningVersion) {
      this.logger.warn(
        `Ignoring stale provisioning job for plan ${data.planId}`,
        PlanProvisioningProcessor.name,
        {
          jobVersion: data.provisioningVersion,
          currentVersion: plan.provisioningVersion,
        },
      );
      return;
    }

    if (plan.provisioningStatus === PlanProvisioningStatus.READY) {
      return;
    }

    const claimed = await this.plansRepository.markProvisioningProcessing(
      data.planId,
      data.provisioningVersion,
    );

    if (!claimed) {
      return;
    }

    try {
      const catalog = await this.billingCatalog.createProductWithPrices({
        planId: plan.id,
        name: plan.name,
        description: plan.description ?? undefined,
        code: plan.code,
        provisioningVersion: data.provisioningVersion,
        prices: plan.prices.map((price) => ({
          amount: price.amount,
          currency: price.currency,
          interval: price.interval as BillingInterval,
        })),
      });

      await this.plansRepository.completeProvisioning({
        planId: plan.id,
        provisioningVersion: data.provisioningVersion,
        stripeProductId: catalog.product.id,
        prices: plan.prices.map((price, index) => ({
          planPriceId: price.id,
          stripePriceId: catalog.prices[index].id,
          stripeLookupKey: catalog.prices[index].lookup_key,
        })),
      });
    } catch (error) {
      await this.recordFailure(data, error);
      throw error;
    }
  }

  private async recordFailure(
    data: ProvisionPlanJobData,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message : 'Unknown provisioning error';

    try {
      await this.plansRepository.markProvisioningFailed(
        data.planId,
        data.provisioningVersion,
        message,
      );
    } catch (persistenceError) {
      this.logger.error(
        `Failed to persist provisioning failure for plan ${data.planId}`,
        persistenceError,
        PlanProvisioningProcessor.name,
      );
    }
  }
}
