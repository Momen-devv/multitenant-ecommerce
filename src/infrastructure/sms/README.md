# SMS

`SmsModule` exports `SmsService`, implemented by `TwilioSmsService`.

## Configuration

Set all three variables to enable sending:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM`

These variables are optional at application startup. The client is created only when the account SID and auth token are present. A send without a client or sender throws `Twilio SMS is not configured`.

## Usage

Import `SmsModule` and inject `SmsService` for `sendSms(to, body)`. Use `SmsQueueService.addSendJob(to, body)` for asynchronous delivery. Twilio errors are logged and rethrown so the queue can retry.

The SMS queue uses four attempts with exponential backoff starting at three seconds. This adapter has no application idempotency key, so an ambiguous provider response followed by a retry can produce another send. Use approved development recipients when exercising this integration.
