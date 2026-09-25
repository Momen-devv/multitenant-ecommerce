import escapeHtml from 'escape-html';

export function orderShippedTemplate(
  name: string,
  orderId: string,
  orderUrl: string,
): string {
  return `
    <html><body>
      <h1>Your order has shipped</h1>
      <p>Hello ${escapeHtml(name)},</p>
      <p>Order <strong>${escapeHtml(orderId)}</strong> is on its way.</p>
      <p><a href="${escapeHtml(orderUrl)}">View your order</a></p>
    </body></html>
  `;
}
