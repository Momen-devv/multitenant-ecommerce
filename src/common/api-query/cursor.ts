import { BadRequestException } from '@nestjs/common';
import type { ApiQuerySort } from './api-query.types';

interface ApiQueryCursor {
  v: 1;
  resource: string;
  sort: Array<[string, 'asc' | 'desc']>;
  values: unknown[];
}

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export function encodeCursor(cursor: ApiQueryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(
  encoded: string,
  resource: string,
  sort: ApiQuerySort[],
): ApiQueryCursor {
  try {
    if (!BASE64URL_PATTERN.test(encoded)) {
      throw new Error('Cursor is not canonical base64url');
    }
    const decoded = Buffer.from(encoded, 'base64url');
    if (decoded.toString('base64url') !== encoded) {
      throw new Error('Cursor is not canonical base64url');
    }
    const parsed = JSON.parse(
      decoded.toString('utf8'),
    ) as Partial<ApiQueryCursor>;
    const expectedSort = sort.map(
      ({ field, direction }) => [field, direction] as [string, 'asc' | 'desc'],
    );

    if (
      parsed.v !== 1 ||
      parsed.resource !== resource ||
      JSON.stringify(parsed.sort) !== JSON.stringify(expectedSort) ||
      !Array.isArray(parsed.values) ||
      parsed.values.length !== sort.length
    ) {
      throw new Error('Cursor does not match this query');
    }

    return parsed as ApiQueryCursor;
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}
