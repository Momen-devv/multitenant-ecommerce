import { registerAs } from '@nestjs/config';

export default registerAs('stripe', () => ({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  timeoutMs: Number(process.env.STRIPE_TIMEOUT_MS!),
  maxNetworkRetries: Number(process.env.STRIPE_MAX_NETWORK_RETRIES!),
}));
