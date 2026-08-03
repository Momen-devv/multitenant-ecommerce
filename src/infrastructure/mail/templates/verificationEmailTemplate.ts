export function verificationEmailTemplate(url: string): string {
  return `
    <html>
        <body>
            <h1>Verify your email address</h1>
            <p>Click the link below to verify your account:</p>
            <a href="${url}">Verify Email</a>
            <p>If you did not create this account, you can ignore this email.</p>
            <p>Best regards,<br/>The Team</p>
        </body>
    </html>
  `;
}
