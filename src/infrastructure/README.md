# Infrastructure

This directory contains NestJS modules that connect feature code to databases, queues, storage, and external providers. Configuration is loaded by `CoreModule` from `src/core/config/`.

## Module guides

| Module                         | Responsibility                                                |
| ------------------------------ | ------------------------------------------------------------- |
| [Database](database/README.md) | PostgreSQL pool, Drizzle client, schemas, and migrations      |
| [Cache](cache/README.md)       | General Redis operations and public endpoint read caching     |
| [Queue](queue/README.md)       | BullMQ producers, workers, and recovery jobs                  |
| [Outbox](outbox/README.md)     | Transactional intents and durable dispatch state              |
| [Payments](payments/README.md) | Stripe client, payment gateway, and Connect event receipts    |
| [Storage](storage/README.md)   | S3 uploads, deletes, bucket initialization, and upload limits |
| [Mail](mail/README.md)         | Resend adapter and email templates                            |
| [SMS](sms/README.md)           | Twilio adapter                                                |
| [Logger](logger/README.md)     | Winston logging and request correlation                       |
| [AI](ai/README.md)             | TypeSafe client and typed decisions                           |

`InfrastructureModule` imports database, logger, cache, mail, SMS, queue, storage, and payment infrastructure. Database, cache, logger, and queue modules are global. AI and outbox are imported by the features that use them.

## Integration conventions

Prefer the exported abstraction or injection token when consuming an adapter: `DATABASE`, `CACHE_SERVICE`, `StorageService`, `MailService`, `SmsService`, `AiService`, or `PAYMENT_GATEWAY`. Import a non-global module in the consuming feature module.

Write durable intents in the same database transaction as the business change. Queue acceptance alone does not establish payment completion or email delivery. Feature services own business rules and durable state; infrastructure supplies transport and provider access.

See the [project README](../../README.md) for local setup and commands.
