import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  resendApiKey: process.env.RESEND_API_KEY!,
  mailFrom: process.env.MAIL_FROM!,
}));
