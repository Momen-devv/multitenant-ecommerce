export const trimStringValue = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const trimStringOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim() || null;
};
