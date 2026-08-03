import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { RedisHealthIndicator } from './indicators/redis.indicator';
import { DrizzleHealthIndicator } from './indicators/drizzle.indicator';
import { SkipResponseTransform } from '@/common/decorators';
import appConfig from '@/core/config/app.config';
import type { ConfigType } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { BullMqHealthIndicator } from './indicators/bullmq.indicator';

@AllowAnonymous()
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
    private drizzle: DrizzleHealthIndicator,
    private redis: RedisHealthIndicator,
    private bullmq: BullMqHealthIndicator,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  @SkipResponseTransform()
  @Get('live')
  @HealthCheck()
  live() {
    const heapLimit = Number(this.config.healthMemoryHeapMb) * 1024 * 1024;
    const rssLimit = Number(this.config.healthMemoryRssMb) * 1024 * 1024;

    return this.health.check([
      () => this.memory.checkHeap('memory_heap', heapLimit),
      () => this.memory.checkRSS('memory_rss', rssLimit),
    ]);
  }

  @SkipResponseTransform()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.drizzle.pingCheck('postgres'),
      () => this.redis.pingCheck('redis'),
      () => this.bullmq.pingCheck('bullmq'),
    ]);
  }
}
