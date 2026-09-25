import { Injectable } from '@nestjs/common';
import type { ConnectPurchaseEventHandler } from '@/infrastructure/payments/connect-purchase-event-handler';
import { CheckoutRepository } from '../repos/checkout.repository';
import { OrdersRepository } from '../repos/orders.repository';

/** Keeps checkout placement and post-payment reconciliation in their owning
 * repositories while Connect infrastructure has one commerce callback. */
@Injectable()
export class OrderPurchaseEventHandler implements ConnectPurchaseEventHandler {
  constructor(
    private readonly checkout: CheckoutRepository,
    private readonly orders: OrdersRepository,
  ) {}

  processPurchaseEvent(
    input: Parameters<ConnectPurchaseEventHandler['processPurchaseEvent']>[0],
  ) {
    if (
      input.eventType.startsWith('refund.') ||
      input.eventType === 'charge.refunded' ||
      input.eventType.startsWith('charge.dispute.')
    )
      return this.orders.processPurchaseEvent(input);
    return this.checkout.processPurchaseEvent(input);
  }
}
