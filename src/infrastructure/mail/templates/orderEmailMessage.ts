import {
  OrderEmailType,
  type OrderEmailIntent,
} from '@/modules/orders/domain/order-email-intent';
import { orderPlacedTemplate } from './orderPlacedTemplate';
import { orderShippedTemplate } from './orderShippedTemplate';
import { orderDeliveredTemplate } from './orderDeliveredTemplate';
import { orderCancelledTemplate } from './orderCancelledTemplate';
import { orderRefundedTemplate } from './orderRefundedTemplate';

/** Selects the subject and HTML for the committed order transition. */
export function renderOrderEmail(
  intent: OrderEmailIntent,
  orderUrl: string,
): { subject: string; html: string } {
  const name = intent.recipientName;
  const orderId = intent.orderId;
  const total = `${intent.currency.toUpperCase()} ${(intent.total / 100).toFixed(2)}`;
  const reason = intent.reason ?? 'Not provided';

  switch (intent.type) {
    case OrderEmailType.Placed:
      return {
        subject: 'Your order has been placed',
        html: orderPlacedTemplate(name, orderId, total, orderUrl),
      };
    case OrderEmailType.Shipped:
      return {
        subject: 'Your order has shipped',
        html: orderShippedTemplate(name, orderId, orderUrl),
      };
    case OrderEmailType.Delivered:
      return {
        subject: 'Your order has been delivered',
        html: orderDeliveredTemplate(name, orderId, orderUrl),
      };
    case OrderEmailType.Cancelled:
      return {
        subject: 'Your order has been cancelled',
        html: orderCancelledTemplate(name, orderId, reason, orderUrl),
      };
    case OrderEmailType.Refunded:
      return {
        subject: 'Your order has been refunded',
        html: orderRefundedTemplate(name, orderId, total, reason, orderUrl),
      };
    default: {
      const unsupported: never = intent.type;
      throw new Error(`Unsupported order email type: ${String(unsupported)}`);
    }
  }
}
