import { ApiProperty } from '@nestjs/swagger';

class IndicatorStatusDto {
  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  status!: 'up' | 'down';

  @ApiProperty({ required: false, example: 'Connection failed' })
  message?: string;
}

export class LiveHealthResultDto {
  @ApiProperty({ enum: ['ok', 'error', 'shutting_down'], example: 'ok' })
  status!: string;

  @ApiProperty({
    example: { memory_heap: { status: 'up' }, memory_rss: { status: 'up' } },
  })
  info?: Record<string, IndicatorStatusDto>;

  @ApiProperty({ example: {} })
  error?: Record<string, IndicatorStatusDto>;

  @ApiProperty({
    example: { memory_heap: { status: 'up' }, memory_rss: { status: 'up' } },
  })
  details!: Record<string, IndicatorStatusDto>;
}

export class ReadyHealthResultDto {
  @ApiProperty({
    description:
      'Optional endpoint cache health and fixed-label process metrics; does not affect required readiness.',
    example: {
      required: false,
      status: 'disabled',
      circuit: 'closed',
      fallback: { active: 0, peak: 0, limit: 16, queued: 0 },
      counters: {},
      observations: {},
      redis: { values: {}, sampledAt: null },
    },
  })
  endpointCache!: Record<string, unknown>;

  @ApiProperty({ enum: ['ok', 'error', 'shutting_down'], example: 'ok' })
  status!: string;

  @ApiProperty({
    example: {
      postgres: { status: 'up' },
      redis: { status: 'up' },
      bullmq: { status: 'up' },
    },
  })
  info?: Record<string, IndicatorStatusDto>;

  @ApiProperty({ example: {} })
  error?: Record<string, IndicatorStatusDto>;

  @ApiProperty({
    example: {
      postgres: { status: 'up' },
      redis: { status: 'up' },
      bullmq: { status: 'up' },
    },
  })
  details!: Record<string, IndicatorStatusDto>;
}
