import { LoggerService } from '@/infrastructure/logger/logger.service';
import { PlanProvisioningQueueService } from '@/infrastructure/queue/plan-provisioning/plan-provisioning-queue.service';
import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  ClaimedOutboxEvent,
  OutboxRepository,
} from '@/infrastructure/outbox/outbox.repository';
import {
  PLAN_PROVISIONING_REQUESTED_EVENT,
  parsePlanProvisioningRequestedPayload,
} from './plan-provisioning.events';

const DISPATCH_INTERVAL_MS = 5_000;
const DISPATCH_BATCH_SIZE = 25;
const CLAIM_LEASE_MS = 60_000;
const MAX_DISPATCH_ATTEMPTS = 10;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

@Injectable()
export class PlanProvisioningOutboxDispatcher {
  private isDispatching = false;

  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly queue: PlanProvisioningQueueService,
    private readonly logger: LoggerService,
  ) {}

  @Interval('plan-provisioning-outbox', DISPATCH_INTERVAL_MS)
  async dispatchPending(): Promise<void> {
    if (this.isDispatching) return;

    this.isDispatching = true;
    try {
      const events = await this.outboxRepository.claimDue(
        PLAN_PROVISIONING_REQUESTED_EVENT,
        DISPATCH_BATCH_SIZE,
        CLAIM_LEASE_MS,
      );

      for (const event of events) {
        await this.dispatchOne(event);
      }
    } catch (error) {
      this.logger.error(
        'Failed to dispatch plan provisioning outbox batch',
        error,
        PlanProvisioningOutboxDispatcher.name,
      );
    } finally {
      this.isDispatching = false;
    }
  }

  private async dispatchOne(event: ClaimedOutboxEvent): Promise<void> {
    try {
      const payload = parsePlanProvisioningRequestedPayload(
        event.payload,
        event.aggregateId,
      );
      await this.queue.addProvisionPlanJob({
        planId: payload.planId,
        provisioningVersion: payload.provisioningVersion,
      });
      await this.outboxRepository.markPublished(event.id);
    } catch (error) {
      await this.recordDispatchFailure(event, error);
    }
  }

  private async recordDispatchFailure(
    event: ClaimedOutboxEvent,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message : 'Unknown outbox dispatch error';

    try {
      const retryDelayMs = Math.min(
        DISPATCH_INTERVAL_MS * 2 ** event.attempts,
        MAX_RETRY_DELAY_MS,
      );
      const deadLettered = await this.outboxRepository.rescheduleAfterFailure(
        event.id,
        message,
        retryDelayMs,
        MAX_DISPATCH_ATTEMPTS,
      );

      if (deadLettered) {
        this.logger.error(
          `Dead-lettered plan provisioning outbox event ${event.id} after ${MAX_DISPATCH_ATTEMPTS} attempts`,
          error,
          PlanProvisioningOutboxDispatcher.name,
        );
      }
    } catch (persistenceError) {
      this.logger.error(
        `Failed to persist outbox dispatch failure for event ${event.id}`,
        persistenceError,
        PlanProvisioningOutboxDispatcher.name,
      );
    }

    this.logger.error(
      `Failed to dispatch plan provisioning outbox event ${event.id}`,
      error,
      PlanProvisioningOutboxDispatcher.name,
    );
  }
}
