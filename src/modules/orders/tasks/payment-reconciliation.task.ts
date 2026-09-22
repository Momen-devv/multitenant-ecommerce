import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CheckoutRepository } from '../repos/checkout.repository';
import { OrdersRepository } from '../repos/orders.repository';

@Injectable()
export class PaymentReconciliationTask {
  constructor(
    private readonly checkout: CheckoutRepository,
    private readonly orders: OrdersRepository,
  ) {}

  @Interval('online-checkout-payment-reconciliation', 60_000)
  async reconcile(): Promise<void> {
    await this.checkout.recoverDueOnlineAttempts();
    await this.orders.recoverDueRefunds();
  }
}
