import { registerAs } from '@nestjs/config';

export default registerAs('notification', () => ({
  inboxEnabled: process.env.NOTIFICATION_INBOX_ENABLED !== 'false',
  emailEnabled: process.env.NOTIFICATION_EMAIL_ENABLED !== 'false',
  streamEnabled: process.env.NOTIFICATION_STREAM_ENABLED !== 'false',
  streamMaxConnections: Number(
    process.env.NOTIFICATION_STREAM_MAX_CONNECTIONS ?? 5,
  ),
  streamHeartbeatMs: Number(
    process.env.NOTIFICATION_STREAM_HEARTBEAT_MS ?? 25_000,
  ),
  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? process.env.BASE_URL ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
}));
