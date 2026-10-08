# Core

`CoreModule` loads application configuration through Nest's global `ConfigModule`. It validates environment values during startup and caches configuration lookups. See [project setup](../../README.md) for a local environment example.

## Configuration map

| Namespace      | Source                                                  | Responsibility                                            |
| -------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `app`          | [app.config.ts](config/app.config.ts)                   | Port, environment, base URL, memory thresholds            |
| `database`     | [database.config.ts](config/database.config.ts)         | PostgreSQL URL                                            |
| `redis`        | [redis.config.ts](config/redis.config.ts)               | Redis URL                                                 |
| `better-auth`  | [better-auth.config.ts](config/better-auth.config.ts)   | Sessions, OAuth, trusted origins                          |
| `mail`         | [mail.config.ts](config/mail.config.ts)                 | Resend credentials and sender                             |
| `sms`          | [sms.config.ts](config/sms.config.ts)                   | Optional Twilio credentials                               |
| `storage`      | [storage.config.ts](config/storage.config.ts)           | S3 endpoint, bucket, region, credentials                  |
| `stripe`       | [strip.config.ts](config/strip.config.ts)               | Stripe credentials, webhooks, redirects, network settings |
| `typesafe`     | [typesafe.config.ts](config/typesafe.config.ts)         | AI credentials and model                                  |
| `notification` | [notification.config.ts](config/notification.config.ts) | Inbox, delivery, and stream flags                         |

[Endpoint cache configuration](config/endpoint-cache.config.ts) is registered by its infrastructure module; its environment schema is included in the central validator.

## Validation and runtime behavior

[env.validation.ts](config/env.validation.ts) is the source of truth for required values, accepted formats, and defaults. Required provider values are validated even if a feature is not used. Twilio values are optional, but sending SMS requires them. Boolean environment flags use the strings `true` and `false`.

`NODE_ENV` accepts `development`, `production`, `benchmark`, and `test`. In benchmark mode, database and Redis factories select `BENCHMARK_DATABASE_URL` and `BENCHMARK_REDIS_URL`; supply both when running benchmarks. Migration commands use the root Drizzle configuration and `DATABASE_URL`.

`APPLICATION_ROLE` defaults to `standalone`. The `api` role disables Nest cron jobs, intervals, and timeouts; `standalone` and `scheduler` enable them. BullMQ processors remain registered for all roles. See [process management](../../PM2.md).

## Adding configuration

1. Add environment validation and defaults to the central schema.
2. Add or update a `registerAs` factory, export it from [config/index.ts](config/index.ts), and register it in [CoreModule](core.module.ts), or explicitly load it in the consuming module.
3. Inject the factory's `KEY` with `ConfigType<typeof factory>` when a consumer needs typed namespaced configuration.
4. Document the setting in the relevant feature or infrastructure README. Use placeholders for credentials.

Factories read `process.env`, and some keep numeric settings as strings. Check the consuming code's conversion rather than assuming schema coercion changes every factory value.
