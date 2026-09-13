export class OrderTransitionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderTransitionConflictError';
  }
}
