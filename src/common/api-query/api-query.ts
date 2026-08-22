import { BadRequestException } from '@nestjs/common';
import {
  and,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type {
  ApiQueryCodec,
  ApiQueryDefinition,
  ApiQueryDefinitionInput,
  ApiQueryFilterField,
  ApiQueryOperator,
  ApiQuerySort,
  ApiQuerySortField,
  CompiledApiQuery,
  ApiListQueryInput,
} from './api-query.types';
import { API_QUERY_LIMITS } from './api-query.limits';
import { decodeCursor, encodeCursor } from './cursor';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function hasOwn(object: object, key: PropertyKey): boolean {
  return Object.hasOwn(object, key);
}

export function defineApiQuery<
  const TFields extends Record<string, AnyPgColumn>,
  const TSortable extends Record<string, ApiQuerySortField>,
  const TFilters extends Record<string, ApiQueryFilterField>,
>(
  definition: ApiQueryDefinitionInput<TFields, TSortable, TFilters>,
): ApiQueryDefinitionInput<TFields, TSortable, TFilters> {
  return definition;
}

export function compileApiQuery(
  definition: ApiQueryDefinition,
  input: ApiListQueryInput,
): CompiledApiQuery {
  assertExpressionLength('cursor', input.cursor, API_QUERY_LIMITS.cursorLength);
  assertExpressionLength('sort', input.sort, API_QUERY_LIMITS.sortLength);
  assertExpressionLength('fields', input.fields, API_QUERY_LIMITS.fieldsLength);

  const limit = input.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new BadRequestException(`limit must be between 1 and ${MAX_LIMIT}`);
  }

  const sort = parseSort(definition, input.sort);
  const visibleFields = parseFields(definition, input.fields);
  const requiredFields = new Set([
    ...visibleFields,
    ...sort.map(({ field }) => field),
  ]);
  const columns = Object.fromEntries(
    [...requiredFields].map((field) => [field, true]),
  );

  const orderBy = sort.map(({ field, direction }) => {
    const sortable = definition.sortable[field];
    if (!sortable) {
      throw new BadRequestException(`Unsupported sort field: ${field}`);
    }
    return direction === 'asc'
      ? sql`${sortable.column} asc nulls last`
      : sql`${sortable.column} desc nulls last`;
  });

  const conditions: SQL[] = [];
  if (input.cursor) {
    const cursor = decodeCursor(input.cursor, definition.resource, sort);
    const cursorValues = cursor.values.map((value, index) => {
      const sortable = definition.sortable[sort[index].field];
      if (value === null && sortable.nullable) return null;
      return sortable.codec.parse(value);
    });
    conditions.push(buildCursorCondition(definition, sort, cursorValues));
  }

  const filterCondition = buildFilterCondition(definition, input.filter);
  if (filterCondition) conditions.push(filterCondition);
  const searchCondition = buildSearchCondition(definition, input.search);
  if (searchCondition) conditions.push(searchCondition);
  const where = conditions.length ? and(...conditions) : undefined;

  return {
    columns,
    where,
    orderBy,
    limit,
    sort,
    visibleFields,
    createPage(rows, extend) {
      const hasNextPage = rows.length > limit;
      const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
      const lastRow = pageRows.at(-1);
      const nextCursor =
        hasNextPage && lastRow
          ? encodeCursor({
              v: 1,
              resource: definition.resource,
              sort: sort.map(({ field, direction }) => [field, direction]),
              values: sort.map(({ field }) => {
                const value = lastRow[field] as never;
                return value === null
                  ? null
                  : definition.sortable[field].codec.serialize(value);
              }),
            })
          : null;

      return {
        items: pageRows.map((row) => {
          const selectedItem = Object.fromEntries(
            [...visibleFields].map((field) => [field, row[field]]),
          );
          return {
            ...selectedItem,
            ...(extend ? extend(row) : {}),
          } as never;
        }),
        pageInfo: {
          nextCursor,
          hasNextPage,
        },
      };
    },
  };
}

export function filter(
  column: AnyPgColumn,
  codec: ApiQueryCodec,
  operators: readonly ApiQueryOperator[],
  options: { nullable?: boolean } = {},
): ApiQueryFilterField {
  return { column, codec, operators, nullable: options.nullable };
}

function parseSort(
  definition: ApiQueryDefinition,
  requestedSort?: string,
): ApiQuerySort[] {
  const requested =
    requestedSort !== undefined
      ? requestedSort.split(',').map((token) => {
          const trimmed = token.trim();
          if (!trimmed || trimmed === '-') {
            throw new BadRequestException('Invalid sort expression');
          }
          return {
            field: trimmed.startsWith('-') ? trimmed.slice(1) : trimmed,
            direction: trimmed.startsWith('-')
              ? ('desc' as const)
              : ('asc' as const),
          };
        })
      : [...definition.defaultSort];

  if (requested.length > (definition.maxSortFields ?? 3)) {
    throw new BadRequestException('Too many sort fields');
  }

  const seen = new Set<string>();
  requested.forEach(({ field }, index) => {
    if (!hasOwn(definition.sortable, field)) {
      throw new BadRequestException(`Unsupported sort field: ${field}`);
    }
    if (seen.has(field)) {
      throw new BadRequestException(`Duplicate sort field: ${field}`);
    }
    if (
      field === definition.primaryKey.field &&
      index !== requested.length - 1
    ) {
      throw new BadRequestException(
        'The primary key must be the final sort field',
      );
    }
    seen.add(field);
  });

  if (!seen.has(definition.primaryKey.field)) {
    requested.push({
      field: definition.primaryKey.field,
      direction: requested.at(-1)?.direction ?? 'desc',
    });
  }
  return requested;
}

function parseFields(
  definition: ApiQueryDefinition,
  requestedFields?: string,
): Set<string> {
  if (requestedFields === undefined) {
    return new Set(Object.keys(definition.fields));
  }

  const fields = requestedFields.split(',').map((field) => field.trim());
  if (fields.some((field) => !field)) {
    throw new BadRequestException('Invalid fields expression');
  }
  if (fields.length > API_QUERY_LIMITS.selectedFields) {
    throw new BadRequestException('Too many selected fields');
  }
  for (const field of fields) {
    if (!hasOwn(definition.fields, field)) {
      throw new BadRequestException(`Unsupported field: ${field}`);
    }
  }
  return new Set(fields);
}

function buildCursorCondition(
  definition: ApiQueryDefinition,
  sort: ApiQuerySort[],
  values: unknown[],
): SQL {
  const branches = sort.map((currentSort, index) => {
    const equalPrevious = sort
      .slice(0, index)
      .map((previousSort, previousIndex) => {
        const previous = definition.sortable[previousSort.field];
        const value = values[previousIndex];
        return value === null
          ? isNull(previous.column)
          : eq(previous.column, value);
      });
    const current = definition.sortable[currentSort.field];
    const value = values[index];
    if (value === null) return undefined;

    const comparison =
      currentSort.direction === 'asc'
        ? gt(current.column, value)
        : lt(current.column, value);
    const after = current.nullable
      ? or(comparison, isNull(current.column))
      : comparison;
    return and(...equalPrevious, after);
  });

  const condition = or(...branches.filter((branch): branch is SQL => !!branch));
  if (!condition) throw new BadRequestException('Invalid cursor boundary');
  return condition;
}

function buildFilterCondition(
  definition: ApiQueryDefinition,
  input?: ApiListQueryInput['filter'],
): SQL | undefined {
  if (!input) return undefined;
  const conditions: SQL[] = [];
  const entries = Object.entries(input);
  let operationCount = 0;
  if (entries.length > API_QUERY_LIMITS.filterFields) {
    throw new BadRequestException('Too many filter fields');
  }

  for (const [field, operations] of entries) {
    if (
      !hasOwn(definition.filters, field) ||
      !operations ||
      typeof operations !== 'object'
    ) {
      throw new BadRequestException(`Unsupported filter field: ${field}`);
    }
    const configured = definition.filters[field];
    operationCount += Object.keys(operations).length;
    if (operationCount > API_QUERY_LIMITS.filterOperations) {
      throw new BadRequestException('Too many filter operations');
    }

    for (const [operatorName, rawValue] of Object.entries(operations)) {
      const operator = operatorName as ApiQueryOperator;
      if (!configured.operators.includes(operator)) {
        throw new BadRequestException(
          `Unsupported operator ${operatorName} for filter ${field}`,
        );
      }

      if (operator === 'in') {
        const rawValues = Array.isArray(rawValue) ? rawValue : [rawValue];
        if (!rawValues.length) {
          throw new BadRequestException(`Filter ${field}.in cannot be empty`);
        }
        if (rawValues.length > API_QUERY_LIMITS.inValues) {
          throw new BadRequestException(
            `Filter ${field}.in accepts at most ${API_QUERY_LIMITS.inValues} values`,
          );
        }
        conditions.push(
          inArray(
            configured.column,
            rawValues.map((value) => configured.codec.parse(value)),
          ),
        );
        continue;
      }

      if (Array.isArray(rawValue)) {
        throw new BadRequestException(
          `Filter ${field}.${operator} accepts one value`,
        );
      }
      const value = configured.codec.parse(rawValue);
      const operation = { eq, ne, gt, gte, lt, lte }[operator];
      conditions.push(operation(configured.column, value));
    }
  }

  return conditions.length ? and(...conditions) : undefined;
}

function assertExpressionLength(
  name: string,
  value: string | undefined,
  maximum: number,
) {
  if (value !== undefined && value.length > maximum) {
    throw new BadRequestException(
      `${name} must not exceed ${maximum} characters`,
    );
  }
}

function buildSearchCondition(
  definition: ApiQueryDefinition,
  rawSearch?: string,
): SQL | undefined {
  if (rawSearch === undefined) return undefined;
  const search = rawSearch.trim();
  if (search.length < 2 || search.length > 100) {
    throw new BadRequestException(
      'search must contain between 2 and 100 characters',
    );
  }
  if (!definition.searchable.length) {
    throw new BadRequestException('Search is not supported for this resource');
  }
  const escapedSearch = search.replace(/[\\%_]/g, '\\$&');
  return or(
    ...definition.searchable.map((column) =>
      ilike(column, `%${escapedSearch}%`),
    ),
  );
}
