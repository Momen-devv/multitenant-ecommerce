# Health

Health exposes anonymous, throttle-exempt probes with Terminus response bodies. Its handlers skip the application's normal success envelope.

| Endpoint                   | Checks                                              | Intended use                                    |
| -------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| `GET /api/v1/health/live`  | Process heap and RSS memory thresholds              | Decide whether to restart the process           |
| `GET /api/v1/health/ready` | PostgreSQL, required Redis, and BullMQ connectivity | Decide whether to route traffic to the instance |

`HEALTH_MEMORY_HEAP_MB` defaults to 400 and `HEALTH_MEMORY_RSS_MB` to 450. Values are converted to bytes in [HealthController](health.controller.ts). Required check failures return service unavailable.

Readiness also returns endpoint cache health as an informational `endpointCache` field. That optional cache is not a required readiness dependency. See [cache infrastructure](../../infrastructure/cache/README.md).

The indicators in `indicators/` check dependency connectivity. These probes do not verify email delivery, Stripe settlement, queue backlog, S3 access, or every business workflow. Investigate those through the corresponding module's state and logs.
