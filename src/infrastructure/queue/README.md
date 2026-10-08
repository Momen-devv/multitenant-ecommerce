# Queue

`QueueModule` globally registers BullMQ and exports the queue submodules. Queue services enqueue work; processors invoke provider adapters or feature services.

## Configuration

BullMQ uses `REDIS_URL`, or `BENCHMARK_REDIS_URL` in benchmark mode. Workers use Redis connections with `maxRetriesPerRequest: null`. Redis must be running before application startup.

`APPLICATION_ROLE` controls Nest scheduled tasks in `AppModule`. It does not disable these BullMQ processors or their Redis job schedulers.

## Queues

| Queue               | Work                                                                 | Producer                       |
| ------------------- | -------------------------------------------------------------------- | ------------------------------ |
| `email`             | Account emails, notification deliveries, and order transition emails | `EmailQueueService`            |
| `sms`               | SMS sends                                                            | `SmsQueueService`              |
| `resource-cleanup`  | Old/orphaned files and orphaned organizations                        | `ResourceCleanupQueueService`  |
| `data-sync`         | Organization name synchronization                                    | `DataSyncQueueService`         |
| `plan-provisioning` | External provisioning of a Plan version                              | `PlanProvisioningQueueService` |
| `stripe-webhook`    | Platform billing events and recovery                                 | `StripeWebhookQueueService`    |
| `connect-webhook`   | Connect payment/account events and recovery                          | `ConnectWebhookQueueService`   |
| `notifications`     | Notification event materialization                                   | `NotificationsQueueService`    |

Queue and job identifiers are defined in [queue.constants.ts](queue.constants.ts).

## Retries and recovery

Most ordinary jobs use four attempts with exponential backoff starting at three seconds. Plan provisioning uses eight attempts starting at five seconds and a stable job ID per Plan and provisioning version. Notification materialization and notification email jobs use one queue attempt; durable feature state governs recovery.

Stripe event jobs also use one attempt. Database event receipts and leases govern their retries. BullMQ recovery schedulers run every 30 seconds for platform webhooks and every 60 seconds for Connect webhooks.

Order email jobs reference a durable delivery ID. Workers claim a database lease, send with a stable provider idempotency key, and record acceptance or schedule a later retry. A completed queue job is not proof that the email was sent. The legacy welcome email job is ignored; durable notification delivery owns welcome email.

In benchmark mode, the email processor skips sends. Other provider operations are not universally disabled by benchmark mode.

## Adding work

Define a job name and payload, expose a typed producer method, and add a processor handler. Set retry and retention options in the producer. Make side effects idempotent; use a transactional outbox when dispatch must survive a database commit followed by Redis failure.

Readiness probes the email queue Redis connection. It does not verify that every worker is processing jobs.
