import { Module } from '@nestjs/common';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { StoresModule } from '@/modules/stores/stores.module';
import { StoreCheckoutSettingsController } from '@/modules/stores/controllers/store-checkout-settings.controller';
import { StoreCheckoutOptionsController } from '@/modules/stores/controllers/store-checkout-options.controller';
import { StoreCheckoutSettingsRepository } from '@/modules/stores/repos/store-checkout-settings.repository';
import { StoreCheckoutSettingsService } from '@/modules/stores/services/store-checkout-settings.service';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';
import { CHECKOUT_ELIGIBILITY_READER } from './interfaces';
import { CheckoutEligibilityService } from './services/checkout-eligibility.service';

@Module({
  imports: [StoresModule, PaymentsModule, SubscriptionsModule],
  controllers: [
    StoreCheckoutSettingsController,
    StoreCheckoutOptionsController,
  ],
  providers: [
    StoreCheckoutSettingsRepository,
    StoreCheckoutSettingsService,
    CheckoutEligibilityService,
    {
      provide: CHECKOUT_ELIGIBILITY_READER,
      useExisting: CheckoutEligibilityService,
    },
  ],
})
export class CheckoutModule {}
