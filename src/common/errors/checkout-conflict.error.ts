export class CheckoutConflictError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'CheckoutConflictError';
  }
}
