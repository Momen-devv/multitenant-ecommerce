import escapeHtml from 'escape-html';

export function orderDeliveredTemplate(
  name: string,
  orderId: string,
  orderUrl: string,
): string {
  return `
    <html><body>
      <h1>Your order has been delivered</h1>
      <p>Hello ${escapeHtml(name)},</p>
      <p>Order <strong>${escapeHtml(orderId)}</strong> has arrived.</p>
      <p><a href="${escapeHtml(orderUrl)}">View your order</a></p>
    </body></html>
  `;
}
