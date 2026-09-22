import type { OrderEmailIntent } from '@/modules/orders/domain/order-email-intent';

const titles: Record<OrderEmailIntent['type'], string> = {
  placed: 'Your order has been placed',
  shipped: 'Your order has shipped',
  delivered: 'Your order has been delivered',
  cancelled: 'Your order has been cancelled',
  refunded: 'Your order has been refunded',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatAmount(total: number, currency: string): string {
  return `${currency.toUpperCase()} ${(total / 100).toFixed(2)}`;
}

export function orderEmailTemplate(
  intent: OrderEmailIntent,
  orderDetailUrl: string,
): { subject: string; html: string } {
  const reason = intent.reason
    ? `<p><strong>Reason:</strong> ${escapeHtml(intent.reason)}</p>`
    : '';
  const title = titles[intent.type];

  return {
    subject: title,
    html: `
      <h1>${escapeHtml(title)}</h1>
      <p>Hello ${escapeHtml(intent.recipientName)},</p>
      <p>Order <strong>${escapeHtml(intent.orderId)}</strong> is ${escapeHtml(intent.type)}.</p>
      <p><strong>Total:</strong> ${escapeHtml(formatAmount(intent.total, intent.currency))}</p>
      ${reason}
      <p><a href="${escapeHtml(orderDetailUrl)}">View your order</a></p>
    `,
  };
}
