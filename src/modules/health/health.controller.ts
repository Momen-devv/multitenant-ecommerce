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
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  LiveHealthResultDto,
  ReadyHealthResultDto,
} from '@/common/dto/health-check-result.dto';

@ApiTags('Health')
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

  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Checks whether the process itself is alive and within memory limits. Does not check external dependencies (database, cache, queue). Used by orchestrators to decide whether to restart the container.',
  })
  @ApiOkResponse({
    description: 'The process is alive and within memory limits.',
    type: LiveHealthResultDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'The process exceeded a memory threshold (heap or RSS).',
  })
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

  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Checks whether the application is ready to serve traffic by verifying connectivity to Postgres, Redis, and the BullMQ queue connection. Used by orchestrators and load balancers to decide whether to route traffic to this instance.',
  })
  @ApiOkResponse({
    description: 'All dependencies (Postgres, Redis, BullMQ) are reachable.',
    type: ReadyHealthResultDto,
  })
  @ApiServiceUnavailableResponse({
    description:
      'One or more dependencies (Postgres, Redis, or BullMQ) are unreachable.',
  })
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
