import { registerAs } from '@nestjs/config';
import { Environment } from '@/common/enums';

export default registerAs('database', () => ({
  url:
    process.env.NODE_ENV === Environment.Benchmark
      ? process.env.BENCHMARK_DATABASE_URL!
      : process.env.DATABASE_URL!,
}));
