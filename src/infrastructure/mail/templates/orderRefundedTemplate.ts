import escapeHtml from 'escape-html';

export function orderRefundedTemplate(
  name: string,
  orderId: string,
  total: string,
  reason: string,
  orderUrl: string,
): string {
  return `
    <html><body>
      <h1>Your order has been refunded</h1>
      <p>Hello ${escapeHtml(name)},</p>
      <p>Order <strong>${escapeHtml(orderId)}</strong> was refunded.</p>
      <p><strong>Total:</strong> ${escapeHtml(total)}</p>
      <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
      <p><a href="${escapeHtml(orderUrl)}">View your order</a></p>
    </body></html>
  `;
}
