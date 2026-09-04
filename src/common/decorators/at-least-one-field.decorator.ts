import { registerDecorator } from 'class-validator';

export function AtLeastOneField(fields: readonly string[]): ClassDecorator {
  return (target) => {
    registerDecorator({
      name: 'atLeastOneField',
      target,
      propertyName: `atLeastOneOf_${fields.join('_')}`,
      constraints: [fields],
      validator: {
        validate: (_value, args) =>
          fields.some((field) => args?.object[field] !== undefined),
        defaultMessage: () =>
          `At least one of ${fields.join(', ')} must be provided`,
      },
    });
  };
}
