import { ValidateBy } from 'class-validator';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const IsBooleanRecord = (): PropertyDecorator =>
  ValidateBy({
    name: 'isBooleanRecord',
    validator: {
      validate: (value: unknown) =>
        isRecord(value) &&
        Object.values(value).every((entry) => typeof entry === 'boolean'),
      defaultMessage: (args) =>
        `${args?.property ?? 'value'} must be an object whose values are booleans`,
    },
  });

export const IsNonNegativeIntegerRecord = (): PropertyDecorator =>
  ValidateBy({
    name: 'isNonNegativeIntegerRecord',
    validator: {
      validate: (value: unknown) =>
        isRecord(value) &&
        Object.values(value).every(
          (entry) =>
            typeof entry === 'number' && Number.isInteger(entry) && entry >= 0,
        ),
      defaultMessage: (args) =>
        `${args?.property ?? 'value'} must be an object whose values are non-negative integers`,
    },
  });
