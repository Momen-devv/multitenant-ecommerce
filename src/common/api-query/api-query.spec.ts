import { PgDialect } from 'drizzle-orm/pg-core';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { BadRequestException } from '@nestjs/common';
import {
  compileApiQuery,
  defineApiQuery,
  filter,
  stringCodec,
  timestampCodec,
  uuidCodec,
} from './index';

const widgets = pgTable('widgets', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

const widgetQuery = defineApiQuery({
  resource: 'widgets',
  primaryKey: {
    field: 'id',
    column: widgets.id,
    codec: uuidCodec,
  },
  defaultSort: [{ field: 'id', direction: 'desc' }],
  fields: {
    id: widgets.id,
    name: widgets.name,
    description: widgets.description,
    createdAt: widgets.createdAt,
  },
  sortable: {
    id: { column: widgets.id, codec: uuidCodec },
    name: { column: widgets.name, codec: stringCodec },
    description: {
      column: widgets.description,
      codec: stringCodec,
      nullable: true,
    },
    createdAt: { column: widgets.createdAt, codec: timestampCodec },
  },
  filters: {},
  searchable: [widgets.name],
});

function typecheckDefinitionConstraints() {
  defineApiQuery({
    ...widgetQuery,
    primaryKey: {
      // @ts-expect-error the primary key must exist in fields and sortable
      field: 'missing',
      column: widgets.id,
      codec: uuidCodec,
    },
  });

  defineApiQuery({
    ...widgetQuery,
    // @ts-expect-error every default sort field must be configured as sortable
    defaultSort: [{ field: 'missing', direction: 'desc' }],
  });
}
void typecheckDefinitionConstraints;

describe('api-query interface', () => {
  it('compiles the default UUIDv7 page and creates an opaque next cursor', () => {
    const query = compileApiQuery(widgetQuery, { limit: 1 });

    expect(query.limit).toBe(1);
    expect(query.columns).toEqual({
      id: true,
      name: true,
      description: true,
      createdAt: true,
    });
    expect(query.sort).toEqual([{ field: 'id', direction: 'desc' }]);

    const page = query.createPage([
      {
        id: '019c0000-0000-7000-8000-000000000003',
        name: 'Third',
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      },
      {
        id: '019c0000-0000-7000-8000-000000000002',
        name: 'Second',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);

    expect(page.items).toHaveLength(1);
    expect(page.pageInfo.hasNextPage).toBe(true);
    expect(page.pageInfo.nextCursor).toEqual(expect.any(String));

    const nextPage = compileApiQuery(widgetQuery, {
      limit: 1,
      cursor: page.pageInfo.nextCursor!,
    });
    expect(nextPage.where).toBeDefined();
  });

  it('selects approved fields and uses a compound cursor for custom sorting', () => {
    const query = compileApiQuery(widgetQuery, {
      limit: 1,
      sort: 'name',
      fields: 'name',
    });

    expect(query.sort).toEqual([
      { field: 'name', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
    expect(query.columns).toEqual({ name: true, id: true });
    expect(query.visibleFields).toEqual(new Set(['name']));

    const page = query.createPage([
      {
        id: '019c0000-0000-7000-8000-000000000001',
        name: 'Acme',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: '019c0000-0000-7000-8000-000000000002',
        name: 'Beta',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);

    expect(page.items).toEqual([{ name: 'Acme' }]);
    expect(
      compileApiQuery(widgetQuery, {
        sort: 'name',
        cursor: page.pageInfo.nextCursor!,
      }).where,
    ).toBeDefined();

    const nextPage = compileApiQuery(widgetQuery, {
      sort: 'name',
      cursor: page.pageInfo.nextCursor!,
    });
    const rendered = new PgDialect().sqlToQuery(nextPage.where!);
    expect(rendered.sql).toContain('"widgets"."name" > $1');
    expect(rendered.sql).toContain('"widgets"."name" = $2');
    expect(rendered.sql).toContain('"widgets"."id" > $3');
    expect(rendered.params).toEqual([
      'Acme',
      'Acme',
      '019c0000-0000-7000-8000-000000000001',
    ]);
  });

  it('combines selected fields with a custom page extension', () => {
    const page = compileApiQuery(widgetQuery, { fields: 'name' }).createPage(
      [
        {
          id: '019c0000-0000-7000-8000-000000000001',
          name: 'Acme',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          owner: { id: 'owner-1' },
        },
      ],
      (row) => ({ owner: row.owner }),
    );

    expect(page.items).toEqual([{ name: 'Acme', owner: { id: 'owner-1' } }]);
  });

  it('uses descending comparisons for a descending compound cursor', () => {
    const query = compileApiQuery(widgetQuery, { limit: 1, sort: '-name' });
    const page = query.createPage([
      {
        id: '019c0000-0000-7000-8000-000000000002',
        name: 'Beta',
        description: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        id: '019c0000-0000-7000-8000-000000000001',
        name: 'Acme',
        description: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const nextPage = compileApiQuery(widgetQuery, {
      sort: '-name',
      cursor: page.pageInfo.nextCursor!,
    });
    const rendered = new PgDialect().sqlToQuery(nextPage.where!);
    expect(rendered.sql).toContain('"widgets"."name" < $1');
    expect(rendered.sql).toContain('"widgets"."id" < $3');
  });

  it('continues within the null group for NULLS LAST sorting', () => {
    const query = compileApiQuery(widgetQuery, {
      limit: 1,
      sort: 'description',
    });
    const page = query.createPage([
      {
        id: '019c0000-0000-7000-8000-000000000001',
        name: 'First',
        description: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: '019c0000-0000-7000-8000-000000000002',
        name: 'Second',
        description: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);

    const nextPage = compileApiQuery(widgetQuery, {
      sort: 'description',
      cursor: page.pageInfo.nextCursor!,
    });
    const rendered = new PgDialect().sqlToQuery(nextPage.where!);
    expect(rendered.sql).toContain('"widgets"."description" is null');
    expect(rendered.sql).toContain('"widgets"."id" > $1');
    expect(rendered.params).toEqual(['019c0000-0000-7000-8000-000000000001']);
  });

  it('creates a cursor for a nullable timestamp in the null group', () => {
    const definition = defineApiQuery({
      ...widgetQuery,
      fields: { ...widgetQuery.fields, publishedAt: widgets.createdAt },
      sortable: {
        ...widgetQuery.sortable,
        publishedAt: {
          column: widgets.createdAt,
          codec: timestampCodec,
          nullable: true,
        },
      },
    });
    const page = compileApiQuery(definition, {
      limit: 1,
      sort: 'publishedAt',
    }).createPage([
      {
        id: '019c0000-0000-7000-8000-000000000001',
        publishedAt: null,
      },
      {
        id: '019c0000-0000-7000-8000-000000000002',
        publishedAt: null,
      },
    ]);

    const nextPage = compileApiQuery(definition, {
      sort: 'publishedAt',
      cursor: page.pageInfo.nextCursor!,
    });
    const rendered = new PgDialect().sqlToQuery(nextPage.where!);
    expect(rendered.sql).toContain('"widgets"."created_at" is null');
    expect(rendered.params).toEqual(['019c0000-0000-7000-8000-000000000001']);
  });

  it('rejects malformed cursors and cursors used with different sorting', () => {
    expect(() =>
      compileApiQuery(widgetQuery, { cursor: 'not-a-cursor' }),
    ).toThrow(BadRequestException);

    const page = compileApiQuery(widgetQuery, {
      limit: 1,
      sort: 'name',
    }).createPage([
      {
        id: '019c0000-0000-7000-8000-000000000001',
        name: 'Acme',
        description: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: '019c0000-0000-7000-8000-000000000002',
        name: 'Beta',
        description: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);

    expect(() =>
      compileApiQuery(widgetQuery, {
        sort: '-name',
        cursor: page.pageInfo.nextCursor!,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a noncanonical base64url cursor', () => {
    const page = compileApiQuery(widgetQuery, { limit: 1 }).createPage([
      {
        id: '019c0000-0000-7000-8000-000000000002',
        name: 'Second',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        id: '019c0000-0000-7000-8000-000000000001',
        name: 'First',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    expect(() =>
      compileApiQuery(widgetQuery, {
        cursor: `${page.pageInfo.nextCursor!}!!!`,
      }),
    ).toThrow(BadRequestException);
  });

  it('combines validated filters and configured-column search', () => {
    const definition = defineApiQuery({
      ...widgetQuery,
      filters: {
        name: filter(widgets.name, stringCodec, ['eq', 'ne', 'in']),
        createdAt: filter(widgets.createdAt, timestampCodec, [
          'gt',
          'gte',
          'lt',
          'lte',
        ]),
      },
    });

    const query = compileApiQuery(definition, {
      filter: { name: { eq: 'Acme' } },
      search: 'widget',
    });
    const rendered = new PgDialect().sqlToQuery(query.where!);

    expect(rendered.sql).toContain('"widgets"."name" = $1');
    expect(rendered.sql).toContain('ilike $2');
    expect(rendered.params).toEqual(['Acme', '%widget%']);
  });

  it('treats PostgreSQL pattern characters in search as literals', () => {
    const query = compileApiQuery(widgetQuery, {
      search: String.raw`100%_\sale`,
    });
    const rendered = new PgDialect().sqlToQuery(query.where!);

    expect(rendered.params).toEqual([String.raw`%100\%\_\\sale%`]);
  });

  it.each(['1', '2026-02-30T00:00:00.000Z', '2026-01-01'])(
    'rejects noncanonical or invalid timestamps: %s',
    (value) => {
      const definition = defineApiQuery({
        ...widgetQuery,
        filters: {
          createdAt: filter(widgets.createdAt, timestampCodec, ['gte']),
        },
      });

      expect(() =>
        compileApiQuery(definition, {
          filter: { createdAt: { gte: value } },
        }),
      ).toThrow(BadRequestException);
    },
  );

  it.each([
    { fields: '' },
    { sort: '' },
    { fields: 'secret' },
    { sort: 'secret' },
    { limit: 101 },
  ])('rejects malformed or unsupported input: %p', (input) => {
    expect(() => compileApiQuery(widgetQuery, input)).toThrow(
      BadRequestException,
    );
  });

  it.each([
    { fields: 'toString' },
    { sort: 'constructor' },
    { filter: { toString: { eq: 'value' } } },
  ])('rejects inherited object properties: %p', (input) => {
    expect(() => compileApiQuery(widgetQuery, input)).toThrow(
      BadRequestException,
    );
  });

  it.each([
    [{ cursor: 'a'.repeat(2049) }, 'cursor must not exceed 2048 characters'],
    [{ sort: 'name'.repeat(65) }, 'sort must not exceed 256 characters'],
    [{ fields: 'name'.repeat(257) }, 'fields must not exceed 1024 characters'],
    [
      { fields: Array.from({ length: 51 }, () => 'name').join(',') },
      'Too many selected fields',
    ],
    [
      {
        filter: Object.fromEntries(
          Array.from({ length: 21 }, (_, index) => [
            `field${index}`,
            { eq: 'value' },
          ]),
        ),
      },
      'Too many filter fields',
    ],
    [
      {
        filter: {
          name: { in: Array.from({ length: 101 }, () => 'value') },
        },
      },
      'Filter name.in accepts at most 100 values',
    ],
  ])('rejects over-budget query input: %s', (input, message) => {
    const definition = defineApiQuery({
      ...widgetQuery,
      filters: {
        name: filter(widgets.name, stringCodec, ['in']),
      },
    });

    expect(() => compileApiQuery(definition, input)).toThrow(message);
  });

  it('rejects more than 40 filter operations', () => {
    const operators = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in'] as const;
    const filters = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [
        `field${index}`,
        filter(widgets.name, stringCodec, operators),
      ]),
    );
    const operations = Object.fromEntries(
      operators.map((operator) => [operator, 'value']),
    );
    const input = {
      filter: Object.fromEntries(
        Array.from({ length: 6 }, (_, index) => [`field${index}`, operations]),
      ),
    };

    expect(() =>
      compileApiQuery(defineApiQuery({ ...widgetQuery, filters }), input),
    ).toThrow('Too many filter operations');
  });
});
