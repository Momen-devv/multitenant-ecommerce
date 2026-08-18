import { Module } from '@nestjs/common';
import { PlansController } from './controllers/plans.controller';
import { PlansRepository } from './repos/plans.repository';
import { PlansService } from './services/plans.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [PlansController],
  providers: [PlansService, PlansRepository],
  exports: [PlansRepository],
})
export class PlansModule {}
