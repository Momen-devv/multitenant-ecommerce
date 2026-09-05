export class VariantConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VariantConflictError';
  }
}
