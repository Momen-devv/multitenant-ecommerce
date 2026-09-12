export class CategoryReorderConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CategoryReorderConflictError';
  }
}
