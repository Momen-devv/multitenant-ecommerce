import { Module } from '@nestjs/common';
import { PlanProvisioningProcessor } from '@/infrastructure/queue/plan-provisioning/plan-provisioning.processor';
import { PlanProvisioningQueueModule } from '@/infrastructure/queue/plan-provisioning/plan-provisioning-queue.module';
import { OutboxModule } from '@/infrastructure/outbox/outbox.module';
import { BillingModule } from '@/modules/billing/billing.module';
import { PlatformPlansRepository } from './repos/platform-plans.repository';
import { PlanPricesRepository } from './repos/plan-prices.repository';
import { PublicPlansRepository } from './repos/public-plans.repository';
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
    PlanProvisioningOutboxDispatcher,
    PlanProvisioningReconciler,
    PlanProvisioningProcessor,
  ],
  exports: [
    PlatformPlansRepository,
    PlanPricesRepository,
    PublicPlansRepository,
  ],
})
export class PlansModule {}
