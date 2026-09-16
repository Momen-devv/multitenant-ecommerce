import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { StorePaymentsService } from '../services/store-payments.service';

const CREATION_RECOVERY_INTERVAL_MS = 60_000;

@Injectable()
export class StorePaymentCreationRecoveryTask {
  constructor(private readonly payments: StorePaymentsService) {}

  @Interval(
    'store-payment-account-creation-recovery',
    CREATION_RECOVERY_INTERVAL_MS,
  )
  async recover(): Promise<void> {
    await this.payments.recoverDueCreations();
  }
}
