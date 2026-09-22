import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxEventType } from '@/common/enums';
import { parseOrderEmailIntent } from '../domain/order-email-intent';
import { OutboxRepository } from '@/infrastructure/outbox/outbox.repository';
import { EmailQueueService } from '@/infrastructure/queue/email/email-queue.service';
import { OrderEmailDeliveryRepository } from '@/infrastructure/queue/email/order-email-delivery.repository';
import { LoggerService } from '@/infrastructure/logger/logger.service';

/** Turns committed Order email intents into recoverable queue work. */
@Injectable()
export class OrderEmailOutboxDispatcher {
  constructor(
    private readonly outbox: OutboxRepository,
    private readonly deliveries: OrderEmailDeliveryRepository,
    private readonly emailQueue: EmailQueueService,
    private readonly logger: LoggerService,
  ) {}

  @Interval('order-email-outbox', 10_000)
  async dispatch(): Promise<void> {
    const events = await this.outbox.claimDue(
      OutboxEventType.ORDER_EMAIL_INTENT,
      50,
      5 * 60_000,
    );
    await Promise.all(events.map((event) => this.dispatchOutboxEvent(event)));

    const dueDeliveryIds = await this.deliveries.findDueForEnqueue(50);
    await Promise.all(
      dueDeliveryIds.map(async (deliveryId) => {
        try {
          await this.emailQueue.addOrderEmailJob(deliveryId);
          await this.deliveries.markEnqueued(deliveryId);
        } catch (error) {
          this.logger.error(
            `Failed to re-enqueue order email ${deliveryId}`,
            error instanceof Error ? error.stack : String(error),
            OrderEmailOutboxDispatcher.name,
          );
        }
      }),
    );
  }

  private async dispatchOutboxEvent(event: {
    id: string;
    payload: unknown;
  }): Promise<void> {
    try {
      const intent = parseOrderEmailIntent(event.payload);
      if (!intent) throw new Error('Order email outbox payload is invalid.');
      const delivery = await this.deliveries.ensurePending({
        outboxEventId: event.id,
        intent,
      });
      await this.emailQueue.addOrderEmailJob(delivery.id);
      await this.deliveries.markEnqueued(delivery.id);
      await this.outbox.markPublished(event.id);
    } catch (error) {
      await this.outbox.rescheduleAfterFailure(
        event.id,
        error instanceof Error ? error.message : String(error),
        60_000,
        10,
      );
    }
  }
}
