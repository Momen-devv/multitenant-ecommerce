# Database

`DatabaseModule` provides a global, schema-aware Drizzle client backed by a PostgreSQL connection pool.

## Configuration

Set `DATABASE_URL`. In benchmark mode the runtime uses `BENCHMARK_DATABASE_URL`; configure it before running benchmarks. Drizzle CLI commands always use `DATABASE_URL` from `drizzle.config.ts`, regardless of the runtime environment.

Each application process has its own pool: maximum 10 connections, minimum setting 2, idle timeout 30 seconds, connection timeout 5 seconds, and maximum 7,500 uses per connection. Application shutdown closes the pool.

## Usage

Inject `DATABASE` from `src/common/constants/injection-tokens.constants.ts` and type it as `NodePgDatabase<typeof schema>`, importing `schema` from `./schema/schema`. The internal `DATABASE_POOL` provider is not exported.

Use `db.transaction(...)` for changes that must commit together, including domain updates and their outbox intents. Repositories remain responsible for Store scoping and access rules.

## Schema changes

Schema definitions live under `schema/` and are collected by `schema/schema.ts`. From the project root:

```sh
npm run db:generate
npm run db:migrate
```

Review generated SQL in `drizzle/` before applying it. `npm run db:push` directly synchronizes the schema and is intended for disposable development databases. Migrations are applied explicitly; application startup does not run them.

Readiness checks PostgreSQL connectivity at `/api/v1/health/ready`.
