export class CheckoutConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutConflictError';
  }
}
