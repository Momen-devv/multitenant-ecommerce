export class StoreLifecycleConflictError extends Error {
  constructor(message = 'The Store does not allow this lifecycle transition.') {
    super(message);
    this.name = 'StoreLifecycleConflictError';
  }
}
