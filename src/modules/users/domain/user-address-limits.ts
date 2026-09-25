export const MAX_USER_ADDRESSES = 5;

export class UserAddressLimitExceededError extends Error {
  constructor(readonly limit: number) {
    super(`A user can have at most ${limit} saved addresses.`);
    this.name = 'UserAddressLimitExceededError';
  }
}

export class UserAddressIdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency-Key was already used with a different address request.');
    this.name = 'UserAddressIdempotencyConflictError';
  }
}
