import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { CartsRepository } from '../repos/carts.repository';

const INACTIVE_CART_DAYS = 30;
const CLEANUP_BATCH_SIZE = 100;

/** Removes only inactive, unlocked selection data; financial history remains. */
@Injectable()
export class CartCleanupTask {
  constructor(
    private readonly carts: CartsRepository,
    private readonly logger: LoggerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanup(): Promise<void> {
    const cutoff = new Date(
      Date.now() - INACTIVE_CART_DAYS * 24 * 60 * 60 * 1000,
    );
    const result = await this.carts.cleanupInactiveResources(
      cutoff,
      CLEANUP_BATCH_SIZE,
    );
    this.logger.log('Cart cleanup finished', CartCleanupTask.name, result);
  }
}
