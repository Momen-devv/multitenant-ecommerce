import { BillingModule } from '@/modules/billing/billing.module';
import { StoresModule } from '@/modules/stores/stores.module';
import { Module } from '@nestjs/common';
import { SubscriptionsController } from './controllers/subscriptions.controller';
import { SubscriptionsRepository } from './repos/subscriptions.repository';
import { SUBSCRIPTIONS_REPOSITORY } from './interfaces/repos';
import { SubscriptionsService } from './services/subscriptions.service';

@Module({
  imports: [BillingModule, StoresModule],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    SubscriptionsRepository,
    { provide: SUBSCRIPTIONS_REPOSITORY, useExisting: SubscriptionsRepository },
  ],
})
export class SubscriptionsModule {}
