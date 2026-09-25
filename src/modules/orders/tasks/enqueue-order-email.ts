import { EmailQueueService } from '@/infrastructure/queue/email/email-queue.service';
import {
  OrderEmailType,
  parseOrderEmailType,
} from '../domain/order-email-intent';

export async function enqueueOrderEmail(
  queue: EmailQueueService,
  deliveryId: string,
  type: string,
): Promise<void> {
  const parsedType = parseOrderEmailType(type);
  if (!parsedType) throw new Error(`Unsupported order email type: ${type}`);

  const enqueue: Record<OrderEmailType, () => Promise<void>> = {
    [OrderEmailType.Placed]: () => queue.addOrderPlacedJob(deliveryId),
    [OrderEmailType.Shipped]: () => queue.addOrderShippedJob(deliveryId),
    [OrderEmailType.Delivered]: () => queue.addOrderDeliveredJob(deliveryId),
    [OrderEmailType.Cancelled]: () => queue.addOrderCancelledJob(deliveryId),
    [OrderEmailType.Refunded]: () => queue.addOrderRefundedJob(deliveryId),
  };
  await enqueue[parsedType]();
}
