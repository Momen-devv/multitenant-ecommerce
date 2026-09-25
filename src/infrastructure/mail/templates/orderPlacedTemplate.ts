import escapeHtml from 'escape-html';

export function orderPlacedTemplate(
  name: string,
  orderId: string,
  total: string,
  orderUrl: string,
): string {
  return `
    <html><body>
      <h1>Your order has been placed</h1>
      <p>Hello ${escapeHtml(name)},</p>
      <p>Thank you for your order. We will let you know when it ships.</p>
      <p>Order <strong>${escapeHtml(orderId)}</strong></p>
      <p><strong>Total:</strong> ${escapeHtml(total)}</p>
      <p><a href="${escapeHtml(orderUrl)}">View your order</a></p>
    </body></html>
  `;
}
