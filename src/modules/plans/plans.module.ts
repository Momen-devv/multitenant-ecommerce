import { Module } from '@nestjs/common';
import { PlanProvisioningProcessor } from '@/infrastructure/queue/plan-provisioning/plan-provisioning.processor';
import { PlanProvisioningQueueModule } from '@/infrastructure/queue/plan-provisioning/plan-provisioning-queue.module';
import { OutboxModule } from '@/infrastructure/outbox/outbox.module';
import { BillingModule } from '@/modules/billing/billing.module';
import { PlatformPlansRepository } from './repos/platform-plans.repository';
import { PlanPricesRepository } from './repos/plan-prices.repository';
import { PublicPlansRepository } from './repos/public-plans.repository';
import {
  PLAN_PRICES_REPOSITORY,
  PLATFORM_PLANS_REPOSITORY,
  PUBLIC_PLANS_REPOSITORY,
} from './interfaces/repos';
import { PlatformPlansController } from './controllers/platform-plans.controller';
import { PlanPricesController } from './controllers/plan-prices.controller';
import { PublicPlansController } from './controllers/public-plans.controller';
import { PlatformPlansService } from './services/platform-plans.service';
import { PlanPricesService } from './services/plan-prices.service';
import { PublicPlansService } from './services/public-plans.service';
import { PlanProvisioningOutboxDispatcher } from './provisioning/plan-provisioning-outbox.dispatcher';
import { PlanProvisioningReconciler } from './provisioning/plan-provisioning.reconciler';

@Module({
  imports: [BillingModule, OutboxModule, PlanProvisioningQueueModule],
  controllers: [
    PlatformPlansController,
    PlanPricesController,
    PublicPlansController,
  ],
  providers: [
    PlatformPlansService,
    PlanPricesService,
    PublicPlansService,
    PlatformPlansRepository,
    PlanPricesRepository,
    PublicPlansRepository,
    {
      provide: PLATFORM_PLANS_REPOSITORY,
      useExisting: PlatformPlansRepository,
    },
    { provide: PLAN_PRICES_REPOSITORY, useExisting: PlanPricesRepository },
    { provide: PUBLIC_PLANS_REPOSITORY, useExisting: PublicPlansRepository },
    PlanProvisioningOutboxDispatcher,
    PlanProvisioningReconciler,
    PlanProvisioningProcessor,
  ],
  exports: [
    PLATFORM_PLANS_REPOSITORY,
    PLAN_PRICES_REPOSITORY,
    PUBLIC_PLANS_REPOSITORY,
  ],
})
export class PlansModule {}
