export function invitationEmailTemplate(
  organizationName: string,
  inviterName: string,
  role: string,
  inviteLink: string,
  rejectLink: string,
): string {
  return `
    <html>
      <body>
        <h1>You have been invited</h1>
        <p>${inviterName} invited you to join ${organizationName} as ${role}.</p>
        <p><a href="${inviteLink}">Accept Invitation</a></p>
        <p><a href="${rejectLink}">Reject Invitation</a></p>
        <p>If you were not expecting this invitation, you can ignore this email.</p>
        <p>Best regards,<br/>The Team</p>
      </body>
    </html>
  `;
}
