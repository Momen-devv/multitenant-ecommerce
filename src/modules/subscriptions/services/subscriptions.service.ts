import { BillingCheckoutService } from '@/modules/billing/services/billing-checkout.service';
import { BillingPortalService } from '@/modules/billing/services/billing-portal.service';
import {
  STORE_REPOSITORY,
  type IStoreRepository,
} from '@/modules/stores/interfaces/repos';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CreateBillingPortalDto, CreateSubscriptionCheckoutDto } from '../dto';
import {
  SUBSCRIPTIONS_REPOSITORY,
  type ISubscriptionsRepository,
} from '../interfaces/repos';

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(STORE_REPOSITORY)
    private readonly storeRepository: IStoreRepository,
    @Inject(SUBSCRIPTIONS_REPOSITORY)
    private readonly subscriptionsRepository: ISubscriptionsRepository,
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
