import { BadRequestException } from '@nestjs/common';
import type { ApiQueryCodec } from './api-query.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function isValidCalendarDate(year: number, month: number, day: number) {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1];
}

export const uuidCodec: ApiQueryCodec<string> = {
  parse(value) {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw new BadRequestException('Expected a UUID value');
    }
    return value;
  },
  serialize(value) {
    return value;
  },
};

export const stringCodec: ApiQueryCodec<string> = {
  parse(value) {
    if (typeof value !== 'string') {
      throw new BadRequestException('Expected a string value');
    }
    return value;
  },
  serialize(value) {
    return value;
  },
};

export const timestampCodec: ApiQueryCodec<Date> = {
  parse(value) {
    if (typeof value !== 'string') {
      throw new BadRequestException('Expected an ISO timestamp');
    }
    const match = TIMESTAMP_PATTERN.exec(value);
    if (
      !match ||
      !isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
    ) {
      throw new BadRequestException('Expected an ISO timestamp');
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Expected an ISO timestamp');
    }
    return date;
  },
  serialize(value) {
    return value.toISOString();
  },
};

export const booleanCodec: ApiQueryCodec<boolean> = {
  parse(value) {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw new BadRequestException('Expected a boolean value');
  },
  serialize(value) {
    return value;
  },
};

export function enumCodec<const T extends string>(
  values: readonly T[],
): ApiQueryCodec<T> {
  const allowed = new Set<string>(values);
  return {
    parse(value) {
      if (typeof value !== 'string' || !allowed.has(value)) {
        throw new BadRequestException(`Expected one of: ${values.join(', ')}`);
      }
      return value as T;
    },
    serialize(value) {
      return value;
    },
  };
}
