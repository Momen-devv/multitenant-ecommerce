export class CategoryLimitExceededError extends Error {
  constructor(
    readonly limit: number,
    readonly usage: number,
  ) {
    super(`Category limit of ${limit} exceeded by current usage of ${usage}`);
    this.name = 'CategoryLimitExceededError';
  }
}
