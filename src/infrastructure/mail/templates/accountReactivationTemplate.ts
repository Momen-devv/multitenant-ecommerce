import escapeHtml from 'escape-html';

export function accountReactivationTemplate(url: string): string {
  return `
    <html>
      <body>
        <h1>Account Reactivation</h1>
        <p>Please click the link below to reactivate your account:</p>
        <p><a href="${escapeHtml(url)}">Reactivate Account</a></p>
      </body>
    </html>
  `;
}
