export class ProductLimitExceededError extends Error {
  constructor(
    readonly limit: number,
    readonly usage: number,
  ) {
    super(`Product limit of ${limit} exceeded by current usage of ${usage}`);
    this.name = 'ProductLimitExceededError';
  }
}
