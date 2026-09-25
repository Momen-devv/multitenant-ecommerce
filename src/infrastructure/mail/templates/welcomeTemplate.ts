import escapeHtml from 'escape-html';

export function welcomeTemplate(name: string): string {
  return `
    <html>
        <body>
            <h1>Welcome to Our E-commerce Platform, ${escapeHtml(name)}!</h1>
            <p>Thank you for signing up. We're excited to have you on board.</p>
            <p>Explore our wide range of products and enjoy a seamless shopping experience.</p>
            <p>Best regards,<br/>The Team</p>
        </body>
    </html>
  `;
}
