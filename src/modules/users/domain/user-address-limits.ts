export const MAX_USER_ADDRESSES = 5;

export class UserAddressLimitExceededError extends Error {
  constructor(readonly limit: number) {
    super(`A user can have at most ${limit} saved addresses.`);
    this.name = 'UserAddressLimitExceededError';
  }
}
