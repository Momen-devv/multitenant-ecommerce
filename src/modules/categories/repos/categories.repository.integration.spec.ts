import { CategoryStatus, ProductStatus } from '@/common/enums';
import { generateUUIDv7 } from '@/common/utils';
import { store } from '@/infrastructure/database/schema/app.schema';
import {
  organization,
  user,
} from '@/infrastructure/database/schema/auth.schema';
import {
  categories,
  productCategories,
} from '@/infrastructure/database/schema/categories.schema';
import {
  products,
  productVariants,
} from '@/infrastructure/database/schema/products.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { ProductsRepository } from '@/modules/products/repos';
import {
  CategoryAssignmentNotFoundError,
  CategoryLifecycleConflictError,
  CategoryLimitExceededError,
  CategoryReorderConflictError,
  CategoryVersionConflictError,
} from '@/common/errors';
import {
  ProductLifecycleConflictError,
  StoreLifecycleConflictError,
} from '@/common/errors';
import { PublicProductsRepository } from '@/modules/products/repos';
import { CategoriesRepository } from './categories.repository';
import { PublicCategoriesRepository } from './public-categories.repository';

if (
  process.env.REQUIRE_TEST_DATABASE === 'true' &&
  !process.env.TEST_DATABASE_URL
) {
  throw new Error(
    'TEST_DATABASE_URL is required for PostgreSQL integration tests',
  );
}

const describeWithPostgres = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

describeWithPostgres(
  'Category PostgreSQL tenant and lifecycle guarantees',
  () => {
    let pool: Pool;
    let secondPool: Pool;
    let db: NodePgDatabase<typeof schema>;
    let secondDb: NodePgDatabase<typeof schema>;
    let repository: CategoriesRepository;
    let secondRepository: CategoriesRepository;
    let productsRepository: ProductsRepository;

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      secondPool = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
      });
      const [{ current_database: name }] = (
        await pool.query<{ current_database: string }>(
          'select current_database()',
        )
      ).rows;
      if (!name.toLowerCase().includes('test')) {
        throw new Error(
          'Category integration tests require a test-named database',
        );
      }
      db = drizzle(pool, { schema });
      secondDb = drizzle(secondPool, { schema });
      repository = new CategoriesRepository(db);
      secondRepository = new CategoriesRepository(secondDb);
      productsRepository = new ProductsRepository(db);
    });

    beforeEach(async () => {
      await pool.query(
        'TRUNCATE TABLE product_categories, categories, products, store, organization, "user" CASCADE',
      );
    });

    afterAll(async () => {
      await Promise.all([pool.end(), secondPool.end()]);
    });

    async function seedStore(suffix: string) {
      const ownerId = `owner-${suffix}`;
      const organizationId = `org-${suffix}`;
      const storeId = generateUUIDv7();
      await db.insert(user).values({
        id: ownerId,
        name: `Owner ${suffix}`,
        email: `${suffix}@example.com`,
      });
      await db.insert(organization).values({
        id: organizationId,
        name: `Organization ${suffix}`,
        slug: `org-${suffix}`,
        createdAt: new Date(),
      });
      await db.insert(store).values({
        id: storeId,
        organizationId,
        ownerId,
        name: `Store ${suffix}`,
        slug: `store-${suffix}`,
      });
      return { storeId, storeSlug: `store-${suffix}` };
    }

    it('enforces the Category limit atomically for concurrent creation', async () => {
      const { storeId } = await seedStore('quota');
      const results = await Promise.allSettled([
        repository.create(
          storeId,
          { name: 'One', slug: 'one', description: null },
          1,
        ),
        secondRepository.create(
          storeId,
          { name: 'Two', slug: 'two', description: null },
          1,
        ),
      ]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejection = results.find((result) => result.status === 'rejected');
      expect(rejection).toMatchObject({
        reason: expect.any(CategoryLimitExceededError),
      });
    });

    it('rejects a Product-to-Category link across Store boundaries', async () => {
      const first = await seedStore('first');
      const second = await seedStore('second');
      const [category] = await db
        .insert(categories)
        .values({
          storeId: first.storeId,
          name: 'Shoes',
          slug: 'shoes',
          position: 0,
        })
        .returning();
      const [product] = await db
        .insert(products)
        .values({
          storeId: second.storeId,
          name: 'Runner',
          slug: 'runner',
        })
        .returning();

      await expect(
        db.insert(productCategories).values({
          storeId: second.storeId,
          productId: product.id,
          categoryId: category.id,
        }),
      ).rejects.toBeDefined();
    });

    it('preserves archived membership while hiding the Category publicly', async () => {
      const fixture = await seedStore('public');
      const category = await repository.create(
        fixture.storeId,
        { name: 'Shoes', slug: 'shoes', description: null },
        5,
      );
      const [product] = await db
        .insert(products)
        .values({
          storeId: fixture.storeId,
          name: 'Runner',
          slug: 'runner',
          status: ProductStatus.PUBLISHED,
          publishedAt: new Date(),
        })
        .returning();
      await db.insert(productCategories).values({
        storeId: fixture.storeId,
        productId: product.id,
        categoryId: category.id,
      });
      const published = await repository.transitionStatus(
        fixture.storeId,
        category.id,
        CategoryStatus.PUBLISHED,
        category.version,
      );
      const publicRepository = new PublicCategoriesRepository(db);
      await expect(
        publicRepository.findVisible(fixture.storeSlug),
      ).resolves.toMatchObject({
        items: [expect.objectContaining({ slug: 'shoes', productCount: 1 })],
      });

      await repository.archive(
        fixture.storeId,
        category.id,
        published!.version,
      );

      await expect(
        publicRepository.findVisible(fixture.storeSlug),
      ).resolves.toEqual({ items: [] });
      await expect(
        db
          .select()
          .from(productCategories)
          .where(eq(productCategories.categoryId, category.id)),
      ).resolves.toHaveLength(1);
      await expect(
        productsRepository.findOne(fixture.storeId, product.id),
      ).resolves.toMatchObject({
        categories: [
          expect.objectContaining({
            slug: 'shoes',
            status: CategoryStatus.ARCHIVED,
          }),
        ],
      });
    });

    it('reorders the complete non-archived Category set atomically and rejects stale versions', async () => {
      const fixture = await seedStore('order');
      const first = await repository.create(
        fixture.storeId,
        { name: 'First', slug: 'first', description: null },
        5,
      );
      const second = await repository.create(
        fixture.storeId,
        { name: 'Second', slug: 'second', description: null },
        5,
      );

      const reordered = await repository.reorder(fixture.storeId, [
        { id: second.id, expectedVersion: second.version },
        { id: first.id, expectedVersion: first.version },
      ]);
      expect(
        reordered.map((category) => [category.slug, category.position]),
      ).toEqual([
        ['second', 0],
        ['first', 1],
      ]);

      await expect(
        repository.reorder(fixture.storeId, [
          { id: first.id, expectedVersion: first.version },
          { id: second.id, expectedVersion: second.version },
        ]),
      ).rejects.toBeInstanceOf(CategoryReorderConflictError);
    });

    it('replaces only non-archived memberships and increments the Product version', async () => {
      const fixture = await seedStore('membership');
      const archived = await repository.create(
        fixture.storeId,
        { name: 'Historic', slug: 'historic', description: null },
        5,
      );
      const replacement = await repository.create(
        fixture.storeId,
        { name: 'Current', slug: 'current', description: null },
        5,
      );
      const [product] = await db
        .insert(products)
        .values({
          storeId: fixture.storeId,
          name: 'Runner',
          slug: 'runner',
        })
        .returning();
      await db.insert(productCategories).values({
        storeId: fixture.storeId,
        productId: product.id,
        categoryId: archived.id,
      });
      await repository.archive(fixture.storeId, archived.id, archived.version);

      const updated = await productsRepository.replaceCategories(
        fixture.storeId,
        product.id,
        [replacement.id],
        product.version,
      );

      expect(updated).toMatchObject({
        version: 2,
        categories: expect.arrayContaining([
          expect.objectContaining({
            slug: 'historic',
            status: CategoryStatus.ARCHIVED,
          }),
          expect.objectContaining({
            slug: 'current',
            status: CategoryStatus.DRAFT,
          }),
        ]),
      });

      const cleared = await productsRepository.replaceCategories(
        fixture.storeId,
        product.id,
        [],
        updated!.version,
      );
      expect(cleared).toMatchObject({
        version: 3,
        categories: [
          expect.objectContaining({
            slug: 'historic',
            status: CategoryStatus.ARCHIVED,
          }),
        ],
      });
    });

    it('enforces Category lifecycle, immutable published slugs, and versions', async () => {
      const fixture = await seedStore('lifecycle');
      const draft = await repository.create(
        fixture.storeId,
        { name: 'Shoes', slug: 'shoes', description: null },
        5,
      );
      const published = await repository.transitionStatus(
        fixture.storeId,
        draft.id,
        CategoryStatus.PUBLISHED,
        draft.version,
      );
      await expect(
        repository.transitionStatus(
          fixture.storeId,
          draft.id,
          CategoryStatus.PUBLISHED,
          published!.version,
        ),
      ).rejects.toBeInstanceOf(CategoryLifecycleConflictError);
      await expect(
        repository.update(
          fixture.storeId,
          draft.id,
          { slug: 'new-shoes' },
          published!.version,
        ),
      ).rejects.toBeInstanceOf(CategoryLifecycleConflictError);
      const reverted = await repository.transitionStatus(
        fixture.storeId,
        draft.id,
        CategoryStatus.DRAFT,
        published!.version,
      );
      const archived = await repository.archive(
        fixture.storeId,
        draft.id,
        reverted!.version,
      );
      await expect(
        repository.archive(fixture.storeId, draft.id, reverted!.version),
      ).rejects.toBeInstanceOf(CategoryVersionConflictError);
      await expect(
        repository.update(
          fixture.storeId,
          draft.id,
          { name: 'No longer mutable' },
          archived!.version,
        ),
      ).rejects.toBeInstanceOf(CategoryLifecycleConflictError);
    });

    it('hides draft, empty, and Categories without published Products', async () => {
      const fixture = await seedStore('visibility');
      const category = await repository.create(
        fixture.storeId,
        { name: 'Shoes', slug: 'shoes', description: null },
        5,
      );
      const [product] = await db
        .insert(products)
        .values({
          storeId: fixture.storeId,
          name: 'Runner',
          slug: 'runner',
          status: ProductStatus.PUBLISHED,
          publishedAt: new Date(),
        })
        .returning();
      const publicRepository = new PublicCategoriesRepository(db);
      await expect(
        publicRepository.findVisible(fixture.storeSlug),
      ).resolves.toEqual({ items: [] });
      const published = await repository.transitionStatus(
        fixture.storeId,
        category.id,
        CategoryStatus.PUBLISHED,
        category.version,
      );
      await expect(
        publicRepository.findVisible(fixture.storeSlug),
      ).resolves.toEqual({ items: [] });
      await db.insert(productCategories).values({
        storeId: fixture.storeId,
        productId: product.id,
        categoryId: published!.id,
      });
      await expect(
        publicRepository.findVisible(fixture.storeSlug),
      ).resolves.toMatchObject({
        items: [expect.objectContaining({ slug: 'shoes' })],
      });
      await db
        .update(products)
        .set({
          status: ProductStatus.DRAFT,
          publishedAt: null,
        })
        .where(eq(products.id, product.id));
      await expect(
        publicRepository.findVisible(fixture.storeSlug),
      ).resolves.toEqual({ items: [] });
    });

    it('rejects inactive Store writes, cross-Store assignment, and over-20 membership', async () => {
      const first = await seedStore('rules-first');
      const second = await seedStore('rules-second');
      const category = await repository.create(
        second.storeId,
        { name: 'Other', slug: 'other', description: null },
        5,
      );
      const [product] = await db
        .insert(products)
        .values({
          storeId: first.storeId,
          name: 'Runner',
          slug: 'runner',
        })
        .returning();
      await expect(
        productsRepository.replaceCategories(
          first.storeId,
          product.id,
          [category.id],
          product.version,
        ),
      ).rejects.toBeInstanceOf(CategoryAssignmentNotFoundError);
      await expect(
        productsRepository.replaceCategories(
          first.storeId,
          product.id,
          Array.from({ length: 21 }, () => generateUUIDv7()),
          product.version,
        ),
      ).rejects.toBeInstanceOf(ProductLifecycleConflictError);
      await db
        .update(store)
        .set({ status: 'owner_closed' })
        .where(eq(store.id, first.storeId));
      await expect(
        repository.create(
          first.storeId,
          { name: 'Closed', slug: 'closed', description: null },
          5,
        ),
      ).rejects.toBeInstanceOf(StoreLifecycleConflictError);
    });

    it('filters the general public Product list by one published Category slug', async () => {
      const fixture = await seedStore('filter');
      const draft = await repository.create(
        fixture.storeId,
        { name: 'Shoes', slug: 'shoes', description: null },
        5,
      );
      const category = await repository.transitionStatus(
        fixture.storeId,
        draft.id,
        CategoryStatus.PUBLISHED,
        draft.version,
      );
      const [product] = await db
        .insert(products)
        .values({
          storeId: fixture.storeId,
          name: 'Runner',
          slug: 'runner',
          status: ProductStatus.PUBLISHED,
          publishedAt: new Date(),
        })
        .returning();
      await db.insert(productVariants).values({
        storeId: fixture.storeId,
        productId: product.id,
        title: 'Default',
        optionSignature: '',
        sku: `SKU-${generateUUIDv7()}`,
        barcode: `BAR-${generateUUIDv7()}`,
        price: 1000,
        inventoryPolicy: 'tracked',
        onHand: 1,
        reserved: 0,
      });
      await db.insert(productCategories).values({
        storeId: fixture.storeId,
        productId: product.id,
        categoryId: category!.id,
      });
      const publicProducts = new PublicProductsRepository(db);

      await expect(
        publicProducts.findPublishedPage(fixture.storeSlug, {}, 'shoes'),
      ).resolves.toMatchObject({
        items: [expect.objectContaining({ slug: 'runner' })],
      });
      await expect(
        publicProducts.findPublishedPage(fixture.storeSlug, {}, 'not-shoes'),
      ).resolves.toMatchObject({ items: [] });
    });
  },
);
