import { z } from 'zod';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const envSchema = z.object({
  NODE_ENV: z.enum(Environment),
  PORT: z.coerce.number(),
});

export function validate(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success)
    throw new Error(`Config validation error: ${result.error.message}`);
  return result.data;
}
