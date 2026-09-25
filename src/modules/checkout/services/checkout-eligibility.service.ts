import { Inject, Injectable } from '@nestjs/common';
import { StoreStatus, SubscriptionStatus } from '@/common/enums';
import {
  STORE_REPOSITORY,
  type IStoreRepository,
} from '@/modules/stores/interfaces/repos';
import {
  SUBSCRIPTIONS_REPOSITORY,
  type ISubscriptionsRepository,
} from '@/modules/subscriptions/interfaces/repos';
import {
  STORE_PAYMENT_READINESS_READER,
  type IStorePaymentReadinessReader,
} from '@/modules/payments/interfaces';
import type {
  ICheckoutEligibilityReader,
  StoreCheckoutEligibility,
} from '../interfaces';

@Injectable()
export class CheckoutEligibilityService implements ICheckoutEligibilityReader {
  constructor(
    @Inject(STORE_REPOSITORY)
    private readonly stores: IStoreRepository,
    @Inject(SUBSCRIPTIONS_REPOSITORY)
    private readonly subscriptions: ISubscriptionsRepository,
    @Inject(STORE_PAYMENT_READINESS_READER)
    private readonly payments: IStorePaymentReadinessReader,
  ) {}

  async getForStore(storeId: string): Promise<StoreCheckoutEligibility> {
    const [store, subscription, onlinePaymentReady] = await Promise.all([
      this.stores.findByIdWithOwner(storeId),
      this.subscriptions.findCurrentByStoreId(storeId),
      this.payments.isOnlineCheckoutReady(storeId),
    ]);

    if (!store) {
      return {
        storeExists: false,
        canAcceptOrders: false,
        onlinePaymentReady: false,
      };
    }

    return {
      storeExists: true,
      canAcceptOrders:
        store.status === StoreStatus.ACTIVE &&
        (subscription?.status === SubscriptionStatus.ACTIVE ||
          subscription?.status === SubscriptionStatus.TRIALING),
      onlinePaymentReady,
    };
  }
}
