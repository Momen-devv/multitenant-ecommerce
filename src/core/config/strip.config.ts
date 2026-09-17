import { registerAs } from '@nestjs/config';

export default registerAs('stripe', () => ({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  connectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET!,
  connectSandboxMode: process.env.STRIPE_CONNECT_SANDBOX_MODE !== 'false',
  connectOnboardingReturnUrl: process.env.STRIPE_CONNECT_ONBOARDING_RETURN_URL!,
  connectOnboardingRefreshUrl:
    process.env.STRIPE_CONNECT_ONBOARDING_REFRESH_URL!,
  checkoutSuccessUrl: process.env.STRIPE_CHECKOUT_SUCCESS_URL!,
  checkoutCancelUrl: process.env.STRIPE_CHECKOUT_CANCEL_URL!,
  timeoutMs: Number(process.env.STRIPE_TIMEOUT_MS!),
  maxNetworkRetries: Number(process.env.STRIPE_MAX_NETWORK_RETRIES!),
}));
