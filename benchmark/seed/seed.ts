import { faker } from '@faker-js/faker';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseError, type Pool } from 'pg';
import { hashPassword } from '../../src/common/utils/password-hash.util';
const { benchmarkPool } = createRequire(__filename)('../lib/database.cjs') as {
  benchmarkPool: () => Pool;
};

async function main() {
  const pool = benchmarkPool();
  const usersCount = Number(process.env.SEED_USERS || 200);
  const storeCount = Number(process.env.SEED_STORES || 3);
  const productCount = Number(process.env.SEED_PRODUCTS || 100);
  if (
    ![usersCount, storeCount, productCount].every(
      (v) => Number.isSafeInteger(v) && v > 0,
    )
  )
    throw new Error('Seed counts must be positive integers.');
  faker.seed(2026);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT 1 FROM "user" LIMIT 1');
    if (existing.rowCount)
      throw new Error(
        'Database is not empty. Stop benchmark PM2 processes and run benchmark:cleanup before seeding.',
      );
    const password = await hashPassword(
      process.env.SEED_PASSWORD || 'Benchmark-Only-Password-2026!',
    );
    const users: { id: string; email: string; addressId: string }[] = [];
    async function createUser(index: number) {
      const id = faker.string.uuid();
      const email = `bench-seed-${index}@example.com`;
      const name = faker.person.fullName();
      await client.query(
        'INSERT INTO "user" (id, name, email, email_verified, phone_number, phone_number_verified) VALUES ($1,$2,$3,true,$4,true)',
        [id, name, email, `+1555${String(index).padStart(7, '0')}`],
      );
      await client.query(
        "INSERT INTO account (id, account_id, provider_id, user_id, password, updated_at) VALUES ($1,$2,'credential',$2,$3,now())",
        [faker.string.uuid(), id, password],
      );
      return { id, email, name };
    }
    for (let i = 0; i < usersCount; i++) {
      const user = await createUser(i);
      const addressId = faker.string.uuid();
      await client.query(
        "INSERT INTO user_addresses (id,user_id,label,recipient_name,recipient_phone,address_line_1,city,country_code) VALUES ($1,$2,'Home',$3,'+15550000000',$4,'Cairo','EG')",
        [addressId, user.id, user.name, faker.location.streetAddress()],
      );
      users.push({ id: user.id, email: user.email, addressId });
    }
    const planId = faker.string.uuid();
    const priceId = faker.string.uuid();
    // Local prerequisite fixtures only: no Stripe provisioning or API calls.
    await client.query(
      "INSERT INTO plans (id,name,code,provisioning_status,stripe_product_id) VALUES ($1,'Benchmark Plan','benchmark','ready','prod_benchmark_local')",
      [planId],
    );
    await client.query(
      "INSERT INTO plan_prices (id,plan_id,amount,interval) VALUES ($1,$2,1000,'month')",
      [priceId, planId],
    );
    const stores: {
      id: string;
      slug: string;
      products: { id: string; slug: string; variantId: string }[];
    }[] = [];
    for (let i = 0; i < storeCount; i++) {
      const owner = await createUser(usersCount + i);
      const organizationId = faker.string.uuid();
      const storeId = faker.string.uuid();
      const slug = `benchmark-store-${i + 1}`;
      const name = faker.company.name();
      await client.query(
        'INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$2,$3,now())',
        [organizationId, name, slug],
      );
      await client.query(
        "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'owner',now())",
        [faker.string.uuid(), organizationId, owner.id],
      );
      await client.query(
        'INSERT INTO store (id,organization_id,owner_id,name,slug) VALUES ($1,$2,$3,$4,$5)',
        [storeId, organizationId, owner.id, name, slug],
      );
      await client.query(
        "INSERT INTO store_checkout_settings (store_id,delivery_countries,cash_on_delivery_enabled) VALUES ($1,ARRAY['EG'],true)",
        [storeId],
      );
      await client.query(
        "INSERT INTO subscriptions (id,store_id,plan_price_id,stripe_subscription_id,status) VALUES ($1,$2,$3,$4,'active')",
        [faker.string.uuid(), storeId, priceId, `sub_benchmark_${i}`],
      );
      const products: { id: string; slug: string; variantId: string }[] = [];
      for (let j = 0; j < productCount; j++) {
        const id = faker.string.uuid();
        const variantId = faker.string.uuid();
        const productSlug = `benchmark-product-${j + 1}`;
        await client.query(
          "INSERT INTO products (id,store_id,name,slug,description,status,published_at) VALUES ($1,$2,$3,$4,$5,'published',now())",
          [
            id,
            storeId,
            faker.commerce.productName(),
            productSlug,
            faker.commerce.productDescription(),
          ],
        );
        await client.query(
          "INSERT INTO product_variants (id,store_id,product_id,title,sku,barcode,price,inventory_policy,on_hand,reserved) VALUES ($1,$2,$3,'Default',$4,$5,$6,'untracked',null,null)",
          [
            variantId,
            storeId,
            id,
            `BENCH-${i}-${j}`,
            `BENCH-BAR-${i}-${j}`,
            faker.number.int({ min: 100, max: 10000 }),
          ],
        );
        products.push({ id, slug: productSlug, variantId });
      }
      stores.push({ id: storeId, slug, products });
    }
    mkdirSync('benchmark/data', { recursive: true });
    // Export before commit so a filesystem failure rolls the database back.
    writeFileSync(
      'benchmark/data/fixtures.json',
      JSON.stringify({ users, stores }, null, 2),
    );
    await client.query('COMMIT');
    console.log(
      `Seeded ${usersCount} shoppers, ${storeCount} stores, ${storeCount * productCount} products. Fixtures: benchmark/data/fixtures.json`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof DatabaseError
      ? `Seed failed (database code: ${error.code}, table: ${error.table || 'unknown'}, column: ${error.column || 'unknown'}).`
      : error instanceof Error
        ? error.message
        : String(error),
  );
  process.exitCode = 1;
});
