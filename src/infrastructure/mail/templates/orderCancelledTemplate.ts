import escapeHtml from 'escape-html';

export function orderCancelledTemplate(
  name: string,
  orderId: string,
  reason: string,
  orderUrl: string,
): string {
  return `
    <html><body>
      <h1>Your order has been cancelled</h1>
      <p>Hello ${escapeHtml(name)},</p>
      <p>Order <strong>${escapeHtml(orderId)}</strong> was cancelled.</p>
      <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
      <p><a href="${escapeHtml(orderUrl)}">View your order</a></p>
    </body></html>
  `;
}
