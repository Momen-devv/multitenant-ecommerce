import { Module } from '@nestjs/common';
import { PlanProvisioningProcessor } from '@/infrastructure/queue/plan-provisioning/plan-provisioning.processor';
import { PlanProvisioningQueueModule } from '@/infrastructure/queue/plan-provisioning/plan-provisioning-queue.module';
import { OutboxModule } from '@/infrastructure/outbox/outbox.module';
import { BillingModule } from '@/modules/billing/billing.module';
import { AdminPlansRepository } from './repos/admin-plans.repository';
import { PlanPricesRepository } from './repos/plan-prices.repository';
import { PublicPlansRepository } from './repos/public-plans.repository';
import { AdminPlansController } from './controllers/admin-plans.controller';
import { PlanPricesController } from './controllers/plan-prices.controller';
import { PublicPlansController } from './controllers/public-plans.controller';
import { AdminPlansService } from './services/admin-plans.service';
import { PlanPricesService } from './services/plan-prices.service';
import { PublicPlansService } from './services/public-plans.service';
import { PlanProvisioningOutboxDispatcher } from './provisioning/plan-provisioning-outbox.dispatcher';
import { PlanProvisioningReconciler } from './provisioning/plan-provisioning.reconciler';

@Module({
  imports: [BillingModule, OutboxModule, PlanProvisioningQueueModule],
  controllers: [
    AdminPlansController,
    PlanPricesController,
    PublicPlansController,
  ],
  providers: [
    AdminPlansService,
    PlanPricesService,
    PublicPlansService,
    AdminPlansRepository,
    PlanPricesRepository,
    PublicPlansRepository,
    PlanProvisioningOutboxDispatcher,
    PlanProvisioningReconciler,
    PlanProvisioningProcessor,
  ],
  exports: [AdminPlansRepository, PlanPricesRepository, PublicPlansRepository],
})
export class PlansModule {}
