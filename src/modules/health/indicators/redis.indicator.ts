import { Injectable, Inject } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { CACHE_SERVICE } from '@/common/constants/injection-tokens.constants';
import type { ICacheService } from '@/infrastructure/redis/redis.interface';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { withTimeout } from '@/common/utils/with-timeout';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(CACHE_SERVICE) private readonly cacheService: ICacheService,
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly logger: LoggerService,
  ) {}

  async pingCheck(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const isHealthy = await withTimeout(
        this.cacheService.ping(),
        3000,
        'Redis ping timeout',
      );
      if (!isHealthy) {
        return indicator.down({ message: 'Redis did not respond with PONG' });
      }
      return indicator.up();
    } catch (error) {
      this.logger.error(
        `${key} health check failed`,
        error,
        RedisHealthIndicator.name,
      );
      return indicator.down({ message: 'Connection failed' });
    }
  }
}
