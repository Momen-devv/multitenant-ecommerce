# API benchmarks

k6 scenarios for the graduation project. PM2 instance comparisons are manual.
The benchmark environment disables rate limits and logs email jobs instead of
sending them. It uses `multitenant_ecommerce_benchmark` and a separate Redis
logical database; production and development keep their normal connections.

## Structure

```text
benchmark/
  scenarios/          signup.js, browse-products.js, shopping.js
  lib/                config.js, profiles.js, auth.js, database.cjs
  seed/seed.ts        Faker-generated shoppers and catalog
  data/               Generated fixtures (ignored by Git)
  results/            Exported results (ignored by Git)
  run-k6.cjs          Standalone k6 launcher
  setup-db.cjs        Create and migrate the benchmark database
  setup-redis.cjs     Configure an empty Redis database for benchmarks
  reset-db.cjs        Clear benchmark application data and Redis
```

## Prepare

Install the standalone [k6 CLI](https://grafana.com/docs/k6/latest/set-up/install-k6/).
The launcher also checks the standard Windows installation if k6 is absent from
PATH. Faker runs in Node during seeding; k6 reads the generated JSON fixtures.

From the repository root:

```powershell
npm run benchmark:setup
npm run benchmark:seed
npm run build
npx pm2 start ecosystem.config.cjs --env benchmark --update-env

# If PM2 is already running, use reload instead of start:
# npx pm2 reload ecosystem.config.cjs --env benchmark --update-env
```

Setup preserves existing database data, applies migrations, and writes benchmark
connection variables to `.env`. Redis setup selects an empty logical database
between 15 and 1, excluding the main Redis database. Once configured, that logical
database is reserved for this project's benchmarks. If your Redis server does not
support logical databases, provide a separate compatible Redis instance.
PostgreSQL setup requires permission to create databases.

Seed creates 200 shoppers, 3 stores, and 100 products per store. Faker uses seed 2026. Each shopper has a verified email, verified phone, credential account, and
saved address. Stores have local subscription fixtures and COD enabled. Products
use untracked inventory to avoid stock exhaustion changing the workload.
This bypasses onboarding for fixture preparation; it is not a test of onboarding
or Stripe subscription provisioning. Fixture Stripe identifiers are local placeholders.
Seed refuses an existing user dataset; reset first when preparing a new comparison.

```powershell
$env:SEED_USERS = '300'       # At least as many as shopping VUS
$env:SEED_STORES = '5'
$env:SEED_PRODUCTS = '200'    # Per store
npm run benchmark:seed
```

## Smoke tests

Run these first; each performs three iterations with one VU.

```powershell
npm run benchmark:signup
npm run benchmark:browse
npm run benchmark:shopping
```

| Scenario | One iteration                                           | Custom result                                            |
| -------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Signup   | CSRF + unique account creation                          | `accounts_created`, `signup_success`, `signup_throttled` |
| Browse   | Product list + product detail, rotating stores/products | `browses_completed`, `browse_success`                    |
| Shopping | Browse + read cart + add item + quote + COD checkout    | `orders_created`, `shopping_success`                     |

Shopping assigns one seeded user to each VU. Each VU signs in on first use and
retains its session cookies across iterations. CSRF is refreshed after login and
before each shopping iteration. Login adds requests on a VU's first iteration.
Each successful shopping iteration places a real unpaid COD order and empties
the cart. The script checks the returned order, not merely HTTP status.

## Load and stress

Endpoint caching is enabled by default in every environment for all supported
resources. Benchmark uses `BENCHMARK_REDIS_URL`, so cleanup also clears endpoint
caches. Other environments use `ENDPOINT_CACHE_REDIS_URL` when configured,
otherwise `REDIS_URL`. Explicit `ENDPOINT_CACHE_ENABLED=false`
disables it for an uncached comparison; reload PM2 after changing configuration.

The first request fills the cache; repeated eligible reads reuse it for up to
approximately 60 seconds, with invalidation on catalog changes. Store visibility and current
variant availability still come from the database on each request. Caching reduces
catalog reads; it does not remove every database query. Lists with search or a
cursor bypass the cache; the browse scenario's first-page list is eligible.

Run a short browse warmup before measuring a warm-cache run:

```powershell
npm run benchmark:browse:load -- -e RATE=10 -e VUS=20 -e DURATION=30s
```

Cache health and hit/miss/bypass counters are included in the readiness endpoint.
With PM2, these counters belong to the individual process handling that request.

`load` sustains `RATE` scenario iterations per second for `DURATION`.
**RATE is operations/second, not HTTP requests/second:** browsing makes two HTTP
requests per operation; shopping makes six, plus initial authentication requests.
Signup makes two. Requests run sequentially within each operation.

```powershell
npm run benchmark:browse:load -- -e RATE=50 -e VUS=100 -e DURATION=3m
npm run benchmark:signup:load -- -e RATE=10 -e VUS=100 -e DURATION=3m
npm run benchmark:shopping:load -- -e RATE=10 -e VUS=100 -e DURATION=3m

npm run benchmark:browse:stress -- -e RATE=25 -e VUS=200
npm run benchmark:signup:stress -- -e RATE=10 -e VUS=200
npm run benchmark:shopping:stress -- -e RATE=10 -e VUS=200
```

Stress ramps to RATE, 2× RATE, and 4× RATE, holding each for one minute by default.
It then ramps back to 1 operation/second and holds for one minute to observe
recovery. Each ramp lasts 30 seconds. Change holds with `STAGE_DURATION` and ramps
with `RAMP_DURATION`.
`VUS` is the fixed worker budget for arrival-rate profiles. If that budget cannot
keep up, k6 reports dropped iterations and fails the threshold. This can indicate
slow API responses or insufficient generator workers; monitor both machines.
See [k6 arrival-rate guidance](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-arrival-rate/).

The previous fixed-volume signup test remains available:

```powershell
npm run benchmark:signup:volume -- -e VUS=100 -e ITERATIONS=10000 -e MAX_DURATION=15m
```

Unlike the previous implementation, `benchmark:signup:load` now uses arrival rate;
`ITERATIONS` applies only to smoke and volume profiles.

## Options and targets

| Variable          | Default                          | Meaning                                      |
| ----------------- | -------------------------------- | -------------------------------------------- |
| `BASE_URL`        | `http://localhost:3000`          | API origin, no API path                      |
| `ORIGIN`          | BASE_URL                         | Trusted Origin header                        |
| `PROFILE`         | smoke                            | smoke, volume, load, stress                  |
| `VUS`             | 1 smoke; 100 otherwise           | Concurrent worker budget                     |
| `RATE`            | 10                               | Operations/second for arrival-rate profiles  |
| `DURATION`        | 3m                               | Load duration                                |
| `STAGE_DURATION`  | 1m                               | Stress plateau duration                      |
| `RAMP_DURATION`   | 30s                              | Stress ramp duration                         |
| `ITERATIONS`      | 3 smoke; 100 volume              | Total fixed-volume attempts                  |
| `MAX_DURATION`    | 5m                               | Fixed-volume time limit                      |
| `P95_MS`          | 500 browse; 2000 signup/shopping | Per-request p95 target                       |
| `SIGNUP_PASSWORD` | Benchmark-only password          | Password for newly created signup accounts   |
| `SEED_PASSWORD`   | Benchmark-only password          | Same password for seeding and shopping login |

Defaults are proposed project targets, not universal standards. Success and
checks must be at least 99%, HTTP failures below 1%, p95 below the latency budget,
and no dropped arrival-rate iterations. Smoke/volume must complete all iterations.
Signup POST, browse list/detail, and cart/quote/checkout write latencies are also
evaluated separately. An error exit means a target
failed; it does not necessarily mean every request failed.

## Save results and compare manually

```powershell
npm run benchmark:browse:load -- -e RATE=50 -e VUS=100 --summary-export=benchmark/results/browse-4-instances.json
npm run pm2:monit
```

For charts across stress stages, save timestamped metric samples with
`--out json=benchmark/results/browse-stress-samples.json`. These files can be large.
Record hardware, commit, dataset size, PM2 instance count, cache configuration,
rate, VUs, duration, success rate, achieved throughput, p95, dropped iterations,
CPU, memory, and restart counts. Repeat each instance configuration three times.
Run the generator on a separate machine when possible. Warm caches consistently
or state explicitly that a run measures cold-cache behavior.

These scripts target separate workload types; they do not yet simulate a measured
production traffic mix. Results exclude rate-limit admission, external email
delivery, phone verification, and online Stripe payment processing. Aggregate
stress p95 mixes stages; use time series to locate the first failing plateau.

## Cleanup and repeat

Stop the benchmark API and scheduler before cleanup:

```powershell
npm run pm2:stop
npm run benchmark:cleanup
npm run benchmark:seed
npx pm2 restart ecosystem.config.cjs --env benchmark --update-env
```

Cleanup immediately truncates all public application tables in
`multitenant_ecommerce_benchmark` and flushes only the configured benchmark Redis
logical database. It preserves database schema, triggers, and migration history,
and removes generated fixtures. It checks database/Redis targets before deletion;
normal database and Redis connections are not cleanup targets. Database reset and
Redis reset are separate operations: if Redis fails after the database clears,
resolve connectivity and rerun cleanup before reseeding.
Benchmark endpoint caching always uses `BENCHMARK_REDIS_URL`, including when
`ENDPOINT_CACHE_REDIS_URL` is configured for the normal application.

Restore production explicitly when finished:

```powershell
npx pm2 reload ecosystem.config.cjs --env production --update-env
```
