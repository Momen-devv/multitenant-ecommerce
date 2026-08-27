import { BillingCheckoutService } from '@/modules/billing/services/billing-checkout.service';
import { BillingPortalService } from '@/modules/billing/services/billing-portal.service';
import { StoreRepository } from '@/modules/stores/repos/store.repository';
import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateBillingPortalDto, CreateSubscriptionCheckoutDto } from '../dto';
import { SubscriptionsRepository } from '../repos/subscriptions.repository';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly storeRepository: StoreRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly billingCheckout: BillingCheckoutService,
    private readonly billingPortal: BillingPortalService,
  ) {}

  async createCheckout(
    userId: string,
    customerEmail: string,
    dto: CreateSubscriptionCheckoutDto,
    idempotencyKey: string,
  ) {
    const ownedStore = await this.getOwnedStore(userId);

    return this.billingCheckout.createSubscriptionCheckout({
      storeId: ownedStore.id,
      customerEmail: customerEmail,
      planPriceId: dto.planPriceId,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
      idempotencyKey,
    });
  }

  async createPortal(userId: string, dto: CreateBillingPortalDto) {
    const ownedStore = await this.getOwnedStore(userId);

    return this.billingPortal.createSession({
      storeId: ownedStore.id,
      returnUrl: dto.returnUrl,
    });
  }

  async getCurrent(userId: string) {
    const ownedStore = await this.getOwnedStore(userId);
    return this.subscriptionsRepository.findCurrentByStoreId(ownedStore.id);
  }

  private async getOwnedStore(userId: string) {
    const store = await this.storeRepository.findByOwnerId(userId);
    if (!store) {
      throw new NotFoundException('Store not found or you do not have a store');
    }
    return store;
  }
}
