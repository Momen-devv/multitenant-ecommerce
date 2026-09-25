import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxEventType } from '@/common/enums';
import { OutboxRepository } from '@/infrastructure/outbox/outbox.repository';
import { OrdersRepository } from '../repos/orders.repository';

/** Prompts refund recovery quickly; the refund row's own lease is the source
 * of truth, so duplicate deliveries are harmless. */
@Injectable()
export class RefundOutboxDispatcher {
  constructor(
    private readonly outbox: OutboxRepository,
    private readonly orders: OrdersRepository,
  ) {}

  @Interval('order-refund-outbox', 10_000)
  async dispatch(): Promise<void> {
    const events = await this.outbox.claimDue(
      OutboxEventType.ORDER_REFUND_REQUESTED,
      50,
      5 * 60_000,
    );
    await Promise.all(
      events.map(async (event) => {
        try {
          await this.orders.processRefund(event.aggregateId);
          await this.outbox.markPublished(event.id);
        } catch (error) {
          await this.outbox.rescheduleAfterFailure(
            event.id,
            error instanceof Error ? error.message : String(error),
            60_000,
            10,
          );
        }
      }),
    );
  }
}
