# Multitenant Ecommerce

A NestJS backend for a multitenant ecommerce platform. Store owners manage catalogs, staff, subscriptions, and orders; shoppers browse products and keep a separate cart for each store.

Stores share a PostgreSQL database, with store membership and permissions controlling staff access and repositories scoping store-owned records. Platform subscription billing is separate from shopper payments through Stripe Connect.

## Start here

- [Local setup](#local-setup): install dependencies, configure providers, and run the API.
- [API access](#api-access): Swagger, authentication, cookies, and CSRF.
- [Development commands](#development-commands): build, test, lint, and database migrations.
- [Project structure](#project-structure): where configuration, infrastructure, and features live.
- [Documentation](#documentation): configuration, shared conventions, infrastructure, and feature guides.

## Features

- Account authentication, email verification, social sign-in, and sessions.
- Store management with owner, manager, and support roles.
- Plans, recurring prices, subscriptions, and platform billing.
- Product and category publishing, images, and storefront browsing.
- Carts, checkout quotes, inventory reservations, orders, fulfillment, and refunds.
- Stripe Connect sandbox merchant onboarding and shopper payments.
- Durable notifications, email delivery, background jobs, and operational recovery.
- Redis caching, structured logging, health probes, and an AI assistant.

## Stack

TypeScript, NestJS, PostgreSQL with Drizzle ORM, Better Auth, Redis with BullMQ, S3-compatible storage, Stripe, Resend, Twilio, and TypeSafe AI.

## Local setup

Run commands from the project root. You need:

- Node.js 22.12 or newer and npm.
- Docker with Docker Compose for PostgreSQL, Redis, and LocalStack.
- Development credentials for the external providers listed below.

The API runs on your host; Docker Compose runs its local dependencies.

### 1. Install dependencies

```sh
npm ci
```

### 2. Configure the environment

Create a root `.env` using the example below. Replace provider placeholders with your development credentials. Docker supplies the database, Redis, and S3 emulator; Resend, TypeSafe AI, OAuth, and Stripe use external provider accounts.

The application validates configuration at startup. Mail, AI, OAuth, and Stripe settings are required even when testing other features. Twilio settings are optional until an SMS is sent. Do not commit credentials.

```dotenv
NODE_ENV=development
APPLICATION_ROLE=standalone
PORT=3000
BASE_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace-with-a-random-secret
SWAGGER_USERNAME=developer
SWAGGER_PASSWORD=replace-with-a-local-password

POSTGRES_USER=ecommerce
POSTGRES_PASSWORD=local-password
POSTGRES_DB=ecommerce
POSTGRES_PORT=5432
DATABASE_URL=postgresql://ecommerce:local-password@localhost:5432/ecommerce
REDIS_PORT=6379
REDIS_PASSWORD=local-password
REDIS_URL=redis://:local-password@localhost:6379

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_S3_BUCKET_NAME=ecommerce
AWS_ENDPOINT=http://localhost:4566

RESEND_API_KEY=replace-with-development-key
MAIL_FROM=sender@example.com
TYPESAFE_API_KEY=replace-with-development-key
TYPESAFE_DEFAULT_MODEL=jev-latest
GOOGLE_CLIENT_ID=replace-with-client-id
GOOGLE_CLIENT_SECRET=replace-with-client-secret
GITHUB_CLIENT_ID=replace-with-client-id
GITHUB_CLIENT_SECRET=replace-with-client-secret

STRIPE_SECRET_KEY=replace-with-sandbox-key
STRIPE_WEBHOOK_SECRET=replace-with-platform-signing-secret
STRIPE_CONNECT_WEBHOOK_SECRET=replace-with-connect-signing-secret
STRIPE_CONNECT_SANDBOX_MODE=true
STRIPE_CONNECT_ONBOARDING_RETURN_URL=http://localhost:3000
STRIPE_CONNECT_ONBOARDING_REFRESH_URL=http://localhost:3000
STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:3000
STRIPE_CHECKOUT_CANCEL_URL=http://localhost:3000
STRIPE_TIMEOUT_MS=10000
STRIPE_MAX_NETWORK_RETRIES=2
```

The redirect URLs above are local placeholders; point them at your frontend pages when testing onboarding or checkout. Register Google and GitHub callback URLs under `/api/auth/callback/google` and `/api/auth/callback/github` on your API origin when testing social sign-in.

The authoritative configuration requirements are in [env.validation.ts](src/core/config/env.validation.ts). See [core configuration](src/core/README.md) for optional settings, defaults, and benchmark configuration.

### 3. Start dependencies and apply migrations

Start the local services and inspect their status:

```sh
docker compose up -d postgres redis localstack
docker compose ps
```

Wait for the services to become healthy, then apply the committed migrations:

```sh
npm run db:migrate
```

### 4. Run the API

```sh
npm run start:dev
```

Storage checks the configured bucket during startup and creates it when S3 reports `NotFound`. LocalStack must be reachable before starting the API.

Open `http://localhost:3000/api` for Swagger. Check `http://localhost:3000/api/v1/health/ready` to verify PostgreSQL, Redis, and BullMQ connectivity. See [health probes](src/modules/health/README.md) for what each probe checks.

## API access

- Swagger UI: `http://localhost:3000/api`, protected by `SWAGGER_USERNAME` and `SWAGGER_PASSWORD`.
- Versioned application endpoints: `/api/v1/...`.
- Better Auth handler and OAuth callbacks: `/api/auth/...`.
- CSRF token: `GET /api/csrf-token`.
- Liveness: `GET /api/v1/health/live`.
- Readiness: `GET /api/v1/health/ready`.

### Authentication and CSRF

Swagger's Basic Auth credentials open the documentation. Application authentication uses session cookies. Swagger preserves these cookies and fetches CSRF tokens automatically.

Other API clients must preserve cookies across requests. Before a `POST`, `PUT`, `PATCH`, or `DELETE` request to the versioned API, fetch `GET /api/csrf-token`, preserve its cookie, and send the returned `csrfToken` in `X-CSRF-Token`. This includes anonymous authentication requests. Fetch a new token after signing in or changing sessions.

To establish an application session:

1. Create an account with `POST /api/v1/auth/sign-up`.
2. Request a verification email with `POST /api/v1/auth/send-verification-email` and follow its link.
3. Sign in with `POST /api/v1/auth/sign-in`.
4. Check the session with `GET /api/v1/auth/get-session`.

Better Auth's `/api/auth/...` handler uses its own CSRF checks, and Stripe webhook routes authenticate provider signatures. See [Auth](src/modules/auth/README.md) and [shared API conventions](src/common/README.md) for details.

Set `TRUSTED_ORIGINS` to a comma-separated list of allowed frontend origins when the frontend runs on another origin. It otherwise defaults to the origin of `BASE_URL`.

### Stripe webhooks

For local Stripe webhook delivery, install and authenticate the Stripe CLI, then run these commands in separate terminals. The scripts forward to port 3000; adjust their targets if your API uses another port.

```sh
npm run stripe:listen
npm run stripe:listen:connect
```

Use the signing secret from each listener for its corresponding environment variable and restart the API. See [payment infrastructure](src/infrastructure/payments/README.md).

## Development commands

| Command                | Purpose                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `npm run start:dev`    | Run with file watching in development mode                 |
| `npm run build`        | Compile the application                                    |
| `npm run start:prod`   | Run compiled code in production mode                       |
| `npm test`             | Run Jest tests                                             |
| `npm run test:e2e`     | Run the end-to-end suite                                   |
| `npm run test:cov`     | Collect test coverage                                      |
| `npm run lint:check`   | Check TypeScript lint rules                                |
| `npm run format:check` | Check TypeScript formatting                                |
| `npm run db:generate`  | Generate migrations after schema changes                   |
| `npm run db:migrate`   | Apply committed migrations                                 |
| `npm run db:push`      | Apply schema directly to a disposable development database |

Build before running `npm run start:prod`. Formatting and lint scripts target TypeScript; check Markdown separately with `npx --no-install prettier --check README.md "src/**/README.md"`.

## Background processing

`APPLICATION_ROLE=standalone` is the local default and enables Nest scheduled tasks. `api` disables those tasks, while `scheduler` enables them. Queue processors are registered for all roles. Review [PM2 process management](PM2.md) before running multiple processes.

Scheduled dispatch and reconciliation recover durable work for Plan provisioning, notifications, online checkout, and refunds. See the [feature workflow map](src/modules/README.md) and [queue guide](src/infrastructure/queue/README.md) when changing background processing.

## Project structure

```text
src/
  common/          Shared types, guards, decorators, and utilities
  core/            Configuration loading and validation
  infrastructure/  Database, cache, providers, queues, and adapters
  modules/         Feature controllers, services, repositories, and tasks
drizzle/           Database migrations
test/              End-to-end tests
benchmark/         Load scenarios, fixtures, and results
```

## Documentation

| Guide                                          | Use it for                                                   |
| ---------------------------------------------- | ------------------------------------------------------------ |
| [Core configuration](src/core/README.md)       | Environment validation, provider settings, and process roles |
| [Common](src/common/README.md)                 | Shared guards, response envelopes, errors, and idempotency   |
| [Feature modules](src/modules/README.md)       | Module responsibilities and the end-to-end commerce workflow |
| [Infrastructure](src/infrastructure/README.md) | Database, cache, storage, queues, and external adapters      |
| [Benchmarks](benchmark/README.md)              | Fixtures, load scenarios, and isolated benchmark services    |
| [PM2](PM2.md)                                  | Running and managing multiple application processes          |
