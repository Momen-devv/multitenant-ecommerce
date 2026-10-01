/** Preserve provider classification without retaining destination-bearing messages. */
export class MailDeliveryError extends Error {
  constructor(
    public readonly providerCode: string,
    public readonly statusCode: number | null,
  ) {
    super('Email provider rejected the request');
  }
  get permanent() {
    return (
      this.providerCode === 'invalid_idempotent_request' ||
      (this.statusCode !== null &&
        this.statusCode >= 400 &&
        this.statusCode < 500 &&
        ![401, 403, 408, 409, 429].includes(this.statusCode))
    );
  }
}
