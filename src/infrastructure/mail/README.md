# Mail

`MailModule` exports `MailService`, implemented by `ResendMailService`. Templates under `templates/` render account, invitation, notification, and order emails.

## Configuration

Set `RESEND_API_KEY` and `MAIL_FROM`. The sender must be an email address accepted by the application's validator and authorized for the configured Resend account.

## Usage

Import `MailModule` and inject `MailService`. `sendEmail(to, subject, html, options?)` sends rendered HTML and returns `{ providerMessageId }` when the provider accepts the request. The optional `idempotencyKey` is passed to Resend.

Normal asynchronous sends go through `EmailQueueService`. Order and notification deliveries keep their own durable database state and pass stable provider idempotency keys. Provider rejection raises `MailDeliveryError` with the provider's error name and status.

Provider acceptance does not prove inbox delivery. Timeouts after acceptance remain ambiguous; retry behavior depends on the provider's idempotency retention and the feature's durable delivery policy.

The email queue processor skips sends in benchmark mode. Direct calls to this adapter still invoke Resend.
