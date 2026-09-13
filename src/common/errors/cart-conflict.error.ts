export class CartConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CartConflictError';
  }
}
