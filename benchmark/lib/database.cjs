const { existsSync } = require('node:fs');
const { loadEnvFile } = require('node:process');
const { Pool } = require('pg');
exports.benchmarkPool = function () {
  if (existsSync('.env')) loadEnvFile('.env');
  const url = process.env.BENCHMARK_DATABASE_URL;
  if (!url || new URL(url).pathname !== '/multitenant_ecommerce_benchmark') {
    throw new Error(
      'BENCHMARK_DATABASE_URL must target multitenant_ecommerce_benchmark.',
    );
  }
  return new Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
};
exports.benchmarkRedisUrl = function () {
  if (existsSync('.env')) loadEnvFile('.env');
  const target = new URL(process.env.BENCHMARK_REDIS_URL);
  const main = new URL(process.env.REDIS_URL);
  if (
    !/^\/[1-9][0-9]*$/.test(target.pathname) ||
    (target.host === main.host && (main.pathname || '/0') === target.pathname)
  ) {
    throw new Error(
      'Cleanup requires an isolated nonzero benchmark Redis database.',
    );
  }
  return target.href;
};
