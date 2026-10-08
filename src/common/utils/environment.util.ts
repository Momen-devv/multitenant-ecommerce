import { Environment } from '../enums/environment.enum';

export function isProductionEnvironment(environment = process.env.NODE_ENV) {
  return (
    environment === Environment.Production ||
    environment === Environment.Benchmark
  );
}
