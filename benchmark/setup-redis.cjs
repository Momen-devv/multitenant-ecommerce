const { existsSync, appendFileSync } = require('node:fs');
const { loadEnvFile } = require('node:process');
const Redis = require('ioredis');

async function main() {
  if (existsSync('.env')) loadEnvFile('.env');
  const main = new URL(process.env.REDIS_URL);
  const target = new URL(process.env.BENCHMARK_REDIS_URL || main.href);
  if (!process.env.BENCHMARK_REDIS_URL) target.pathname = '/15';
  if (
    !/^\/[1-9][0-9]*$/.test(target.pathname) ||
    (main.host === target.host && (main.pathname || '/0') === target.pathname)
  )
    throw new Error('Use a separate Redis database for benchmarks.');
  const client = new Redis(target.href, {
    lazyConnect: true,
    connectTimeout: 5000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  client.on('error', () => {});
  try {
    await client.connect();
    if (!process.env.BENCHMARK_REDIS_URL) {
      let found = false;
      for (let db = 15; db >= 1; db--) {
        if (main.pathname === `/${db}`) continue;
        await client.select(db);
        if ((await client.dbsize()) === 0) {
          target.pathname = `/${db}`;
          found = true;
          break;
        }
      }
      if (!found) throw new Error('No empty Redis database available.');
    }
    if (!process.env.BENCHMARK_REDIS_URL)
      appendFileSync(
        '.env',
        `\nBENCHMARK_REDIS_URL=${JSON.stringify(target.href)}\n`,
      );
    console.log(
      `Benchmark Redis database ${target.pathname.slice(1)} configured. No Redis data deleted.`,
    );
  } finally {
    client.disconnect();
  }
}
main().catch(() => {
  console.error(
    'Benchmark Redis setup failed. Configure a dedicated BENCHMARK_REDIS_URL using a separate nonzero database.',
  );
  process.exitCode = 1;
});
