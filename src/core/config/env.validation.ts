import { Environment } from '@/common/enums';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(Environment),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.url('DATABASE_URL must be a valid URL'),
  REDIS_URL: z.url('REDIS_URL must be a valid URL'),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  MAIL_FROM: z.email().describe('MAIL_FROM must be a valid email address'),
  BETTER_AUTH_SECRET: z.string().min(1, 'BETTER_AUTH_SECRET is required'),
  BETTER_AUTH_URL: z.string().min(1, 'BETTER_AUTH_URL must be a valid URL'),
});

export function validate(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success)
    throw new Error(`Config validation error: ${result.error.message}`);
  return result.data;
}
