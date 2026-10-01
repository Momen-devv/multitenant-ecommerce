import { MailDeliveryError } from './mail-delivery.error';

describe('MailDeliveryError', () => {
  it.each([401, 403, 408, 409, 429, 500, 503, null])(
    'keeps status %s retryable',
    (status) => {
      expect(new MailDeliveryError('provider_error', status).permanent).toBe(
        false,
      );
    },
  );

  it.each([400, 402, 404, 422, 499])(
    'keeps other eligible 4xx status %s permanent',
    (status) => {
      expect(new MailDeliveryError('provider_error', status).permanent).toBe(
        true,
      );
    },
  );

  it.each([null, 401, 403, 500])(
    'keeps invalid idempotent requests permanent with status %s',
    (status) => {
      expect(
        new MailDeliveryError('invalid_idempotent_request', status).permanent,
      ).toBe(true);
    },
  );
});
