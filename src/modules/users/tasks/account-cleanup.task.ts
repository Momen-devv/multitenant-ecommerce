import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import {
  ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../interfaces/repos';

// 30 days grace period for reactivation
const REACTIVATION_GRACE_PERIOD_DAYS = 30;

@Injectable()
export class AccountCleanupTask {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    private readonly logger: LoggerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup() {
    this.logger.log(
      'Starting inactive accounts cleanup',
      AccountCleanupTask.name,
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - REACTIVATION_GRACE_PERIOD_DAYS);

    const deletedCount =
      await this.accountRepository.deleteInactiveAccountsBefore(cutoffDate);

    this.logger.log(
      'Inactive accounts cleanup finished',
      AccountCleanupTask.name,
      {
        deletedCount,
      },
    );
  }
}
