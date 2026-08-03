import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: process.env.PORT!,
  nodeEnv: process.env.NODE_ENV!,
  baseUrl: process.env.BASE_URL!,
  healthMemoryHeapMb: process.env.HEALTH_MEMORY_HEAP_MB!,
  healthMemoryRssMb: process.env.HEALTH_MEMORY_RSS_MB!,
}));
