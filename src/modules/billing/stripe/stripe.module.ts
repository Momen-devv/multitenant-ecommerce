import { Module, Provider } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import Stripe from 'stripe';
import { stripeConfig } from '@/core/config';
import { STRIPE_CLIENT } from './stripe.constants';

const stripeClientProvider: Provider = {
  provide: STRIPE_CLIENT,
  inject: [stripeConfig.KEY],

  useFactory: (configuration: ConfigType<typeof stripeConfig>) =>
    new Stripe(configuration.secretKey, {
      timeout: configuration.timeoutMs,
      maxNetworkRetries: configuration.maxNetworkRetries,
    }),
};

@Module({
  providers: [stripeClientProvider],
  exports: [STRIPE_CLIENT],
})
export class StripeModule {}
