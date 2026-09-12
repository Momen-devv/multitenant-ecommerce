export class CategoryVersionConflictError extends Error {
  constructor(message = 'Category changed during this request.') {
    super(message);
    this.name = 'CategoryVersionConflictError';
  }
}
