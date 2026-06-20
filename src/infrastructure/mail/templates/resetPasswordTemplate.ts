export function resetPasswordTemplate(url: string): string {
  return `
    <html>
        <body>
            <h1>Password Reset Request</h1>
            <p>We received a request to reset your password. Click the link below to set a new password:</p>
            <a href="${url}">Reset Password</a>
            <p>If you did not request a password reset, please ignore this email.</p>
            <p>Best regards,<br/>The Team</p>
        </body>
    </html>
  `;
}
