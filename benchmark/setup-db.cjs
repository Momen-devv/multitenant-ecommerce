const { existsSync, appendFileSync } = require('node:fs');
const { loadEnvFile } = require('node:process');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');

async function main() {
  if (existsSync('.env')) loadEnvFile('.env');
  const source = new URL(process.env.DATABASE_URL);
  const target = new URL(process.env.BENCHMARK_DATABASE_URL || source.href);
  target.pathname = '/multitenant_ecommerce_benchmark';
  if (
    process.env.BENCHMARK_DATABASE_URL &&
    target.href !== process.env.BENCHMARK_DATABASE_URL
  ) {
    throw new Error('Unexpected benchmark database name.');
  }
  if (source.pathname === target.pathname)
    throw new Error('Source must differ from benchmark database.');

  const admin = new Pool({
    connectionString: source.href,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    const existing = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      ['multitenant_ecommerce_benchmark'],
    );
    if (!existing.rowCount) {
      await admin.query('CREATE DATABASE "multitenant_ecommerce_benchmark"');
      console.log('Created multitenant_ecommerce_benchmark.');
    } else {
      console.log('Benchmark database already exists.');
    }
  } finally {
    await admin.end();
  }

  const pool = new Pool({
    connectionString: target.href,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
    console.log('Benchmark database migrations applied.');
  } finally {
    await pool.end();
  }
  if (!process.env.BENCHMARK_DATABASE_URL) {
    appendFileSync(
      '.env',
      `\nBENCHMARK_DATABASE_URL=${JSON.stringify(target.href)}\n`,
    );
    console.log('Saved BENCHMARK_DATABASE_URL in .env.');
  }
}

main().catch((error) => {
  console.error(
    `Benchmark database setup failed${error.code ? ` (code: ${error.code})` : ''}. Check database access and migration files.`,
  );
  process.exitCode = 1;
});
