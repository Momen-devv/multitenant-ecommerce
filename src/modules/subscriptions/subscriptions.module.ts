import { BillingModule } from '@/modules/billing/billing.module';
import { StoresModule } from '@/modules/stores/stores.module';
import { Module } from '@nestjs/common';
import { SubscriptionsController } from './controllers/subscriptions.controller';
import { SubscriptionsRepository } from './repos/subscriptions.repository';
import { SubscriptionsService } from './services/subscriptions.service';

@Module({
  imports: [BillingModule, StoresModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsRepository],
})
export class SubscriptionsModule {}
