import { registerAs } from '@nestjs/config';
import { Environment } from '@/common/enums';

export default registerAs('redis', () => ({
  url:
    process.env.NODE_ENV === Environment.Benchmark
      ? process.env.BENCHMARK_REDIS_URL!
      : process.env.REDIS_URL!,
}));
