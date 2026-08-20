import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QueueNames } from '../queue.constants';
import { PlanProvisioningQueueService } from './plan-provisioning-queue.service';

@Module({
  imports: [BullModule.registerQueue({ name: QueueNames.PLAN_PROVISIONING })],
  providers: [PlanProvisioningQueueService],
  exports: [PlanProvisioningQueueService],
})
export class PlanProvisioningQueueModule {}
