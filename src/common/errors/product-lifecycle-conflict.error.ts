export class ProductLifecycleConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductLifecycleConflictError';
  }
}
