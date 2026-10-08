const { existsSync, unlinkSync } = require('node:fs');
const { benchmarkPool, benchmarkRedisUrl } = require('./lib/database.cjs');
const Redis = require('ioredis');

async function main() {
  const redisUrl = benchmarkRedisUrl();
  const pool = benchmarkPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const db = await client.query('SELECT current_database() AS name');
    if (db.rows[0].name !== 'multitenant_ecommerce_benchmark')
      throw new Error('Unexpected database.');
    const tables = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'",
    );
    if (tables.rowCount) {
      const names = tables.rows.map(
        ({ tablename }) => `public."${tablename.replaceAll('"', '""')}"`,
      );
      // No CASCADE: never pull in tables from other schemas implicitly.
      await client.query(`TRUNCATE TABLE ${names.join(', ')} RESTART IDENTITY`);
    }
    await client.query('COMMIT');
    if (existsSync('benchmark/data/fixtures.json'))
      unlinkSync('benchmark/data/fixtures.json');
    console.log(
      'Cleared benchmark application data. Tables, triggers, and migrations preserved.',
    );
    const redis = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 5000,
      commandTimeout: 5000,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    redis.on('error', () => {});
    try {
      await redis.connect();
      await redis.flushdb();
      console.log(
        `Cleared benchmark Redis database ${new URL(redisUrl).pathname.slice(1)}.`,
      );
    } finally {
      redis.disconnect();
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(
    `Cleanup failed${error.code ? ` (database code: ${error.code})` : ''}. Check benchmark database configuration and stop PM2 first.`,
  );
  process.exitCode = 1;
});
