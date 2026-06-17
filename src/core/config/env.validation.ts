import { Environment } from '@/common/enums';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(Environment),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.url('DATABASE_URL must be a valid URL'),
  REDIS_URL: z.url('REDIS_URL must be a valid URL'),
});

export function validate(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success)
    throw new Error(`Config validation error: ${result.error.message}`);
  return result.data;
}
