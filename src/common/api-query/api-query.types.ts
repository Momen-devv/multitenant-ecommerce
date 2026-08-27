import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export type ApiQueryDirection = 'asc' | 'desc';
export type ApiQueryScalar = string | number | boolean | Date | null;
export type ApiQueryOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';

export interface ApiQueryCodec<T extends ApiQueryScalar = ApiQueryScalar> {
  parse(value: unknown): T;
  serialize(value: T): string | number | boolean | null;
}

export interface ApiQuerySortField {
  column: AnyPgColumn;
  codec: ApiQueryCodec;
  nullable?: boolean;
}

export interface ApiQueryFilterField extends ApiQuerySortField {
  operators: readonly ApiQueryOperator[];
}

export interface ApiQueryDefinition {
  resource: string;
  primaryKey: {
    field: string;
    column: AnyPgColumn;
    codec: ApiQueryCodec;
  };
  defaultSort: readonly ApiQuerySort[];
  maxSortFields?: number;
  fields: Record<string, AnyPgColumn>;
  sortable: Record<string, ApiQuerySortField>;
  filters: Record<string, ApiQueryFilterField>;
  searchable: readonly AnyPgColumn[];
}

export interface ApiQuerySort<TField extends string = string> {
  field: TField;
  direction: ApiQueryDirection;
}

export type ApiQueryDefinitionInput<
  TFields extends Record<string, AnyPgColumn>,
  TSortable extends Record<string, ApiQuerySortField>,
  TFilters extends Record<string, ApiQueryFilterField>,
> = Omit<
  ApiQueryDefinition,
  'primaryKey' | 'defaultSort' | 'fields' | 'sortable' | 'filters'
> & {
  primaryKey: {
    field: Extract<keyof NoInfer<TFields> & keyof NoInfer<TSortable>, string>;
    column: TFields[keyof TFields];
    codec: ApiQueryCodec;
  };
  defaultSort: readonly ApiQuerySort<
    Extract<keyof NoInfer<TSortable>, string>
  >[];
  fields: TFields;
  sortable: TSortable;
  filters: TFilters;
};

export type ApiQueryFilterInput = Record<
  string,
  Record<string, string | string[]>
>;

export interface ApiListQueryInput {
  limit?: number;
  cursor?: string;
  sort?: string;
  search?: string;
  fields?: string;
  filter?: ApiQueryFilterInput;
}

export interface CursorPage<T> {
  items: T[];
  pageInfo: {
    nextCursor: string | null;
    hasNextPage: boolean;
  };
}

export interface CompiledApiQuery {
  columns: Record<string, boolean>;
  where: SQL | undefined;
  orderBy: SQL[];
  limit: number;
  sort: ApiQuerySort[];
  visibleFields: ReadonlySet<string>;
  createPage<
    Row extends Record<string, unknown>,
    Extension extends Record<string, unknown> = Record<string, never>,
  >(
    rows: Row[],
    extend?: (row: Row) => Extension,
  ): CursorPage<Record<string, unknown> & Extension>;
}
