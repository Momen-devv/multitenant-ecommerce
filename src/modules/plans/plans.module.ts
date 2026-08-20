import { Module } from '@nestjs/common';
import { PlanProvisioningProcessor } from '@/infrastructure/queue/plan-provisioning/plan-provisioning.processor';
import { PlanProvisioningQueueModule } from '@/infrastructure/queue/plan-provisioning/plan-provisioning-queue.module';
import { OutboxModule } from '@/infrastructure/outbox/outbox.module';
import { BillingModule } from '@/modules/billing/billing.module';
import { PlansController } from './controllers/plans.controller';
import { PlansRepository } from './repos/plans.repository';
import { PlansService } from './services/plans.service';
import { PlanProvisioningOutboxDispatcher } from './provisioning/plan-provisioning-outbox.dispatcher';
import { PlanProvisioningReconciler } from './provisioning/plan-provisioning.reconciler';

@Module({
  imports: [BillingModule, OutboxModule, PlanProvisioningQueueModule],
  controllers: [PlansController],
  providers: [
    PlansService,
    PlansRepository,
    PlanProvisioningOutboxDispatcher,
    PlanProvisioningReconciler,
    PlanProvisioningProcessor,
  ],
  exports: [PlansRepository],
})
export class PlansModule {}
