import { Injectable, Inject } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { withTimeout } from '@/common/utils';

@Injectable()
export class DrizzleHealthIndicator {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly logger: LoggerService,
  ) {}

  async pingCheck(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await withTimeout(
        this.db.execute(sql`SELECT 1`),
        3000,
        'Postgres ping timeout',
      );
      return indicator.up();
    } catch (error) {
      this.logger.error(
        `${key} health check failed`,
        error,
        DrizzleHealthIndicator.name,
      ); // اللوج الكامل هنا
      return indicator.down({ message: 'Connection failed' });
    }
  }
}
