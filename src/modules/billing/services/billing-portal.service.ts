import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Stripe } from 'stripe';
import { BillingRepository } from '../repos/billing.repository';
import { STRIPE_CLIENT } from '../stripe/stripe.constants';

export type CreateBillingPortalInput = {
  storeId: string;
  returnUrl: string;
};

export type BillingPortalResult = {
  url: string;
};

@Injectable()
export class BillingPortalService {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly billingRepository: BillingRepository,
  ) {}

  async createSession(
    input: CreateBillingPortalInput,
  ): Promise<BillingPortalResult> {
    this.assertHttpUrl(input.returnUrl);

    const customer = await this.billingRepository.findBillingCustomer(
      input.storeId,
    );
    if (!customer) {
      throw new NotFoundException('Billing customer was not found');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: input.returnUrl,
    });

    return { url: session.url };
  }

  private assertHttpUrl(value: string): void {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException(
        'returnUrl must be an absolute HTTP or HTTPS URL',
      );
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException(
        'returnUrl must be an absolute HTTP or HTTPS URL',
      );
    }
  }
}
