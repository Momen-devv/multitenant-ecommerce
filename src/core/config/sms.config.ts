import { registerAs } from '@nestjs/config';

export default registerAs('sms', () => ({
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioFrom: process.env.TWILIO_FROM,
}));
