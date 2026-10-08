import {
  Global,
  Module,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

// Authentication guards are outside this isolated public-health HTTP suite.
jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

import {
  DATABASE,
  CACHE_SERVICE,
} from '@/common/constants/injection-tokens.constants';
import appConfig from '@/core/config/app.config';
import { ReadCacheService } from '@/infrastructure/cache/read-cache.service';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { EmailQueueService } from '@/infrastructure/queue/email/email-queue.service';
import { HealthModule } from '@/modules/health/health.module';

// Keep real routing, controllers, Terminus, and health indicators; replace only
// external connections so the suite does not need local services or credentials.
const database = { execute: jest.fn() };
const cache = { ping: jest.fn() };
const queue = { pingCheck: jest.fn() };
const endpointCache = { health: jest.fn() };
const config = { healthMemoryHeapMb: '4096', healthMemoryRssMb: '4096' };

@Global()
@Module({
  providers: [
    { provide: DATABASE, useValue: database },
    { provide: CACHE_SERVICE, useValue: cache },
    { provide: EmailQueueService, useValue: queue },
    { provide: ReadCacheService, useValue: endpointCache },
    { provide: LoggerService, useValue: { error: jest.fn() } },
    { provide: appConfig.KEY, useValue: config },
  ],
  exports: [
    DATABASE,
    CACHE_SERVICE,
    EmailQueueService,
    ReadCacheService,
    LoggerService,
    appConfig.KEY,
  ],
})
class HealthTestDependencies {}

describe('Health HTTP endpoints', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        HealthTestDependencies,
        HealthModule,
        RouterModule.register([{ path: 'health', module: HealthModule }]),
      ],
    }).compile();
    app = moduleFixture.createNestApplication<App>();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    config.healthMemoryHeapMb = '4096';
    database.execute.mockResolvedValue([]);
    cache.ping.mockResolvedValue(true);
    queue.pingCheck.mockResolvedValue(true);
    endpointCache.health.mockReturnValue({ status: 'up' });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports liveness without querying external dependencies', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      details: { memory_heap: { status: 'up' }, memory_rss: { status: 'up' } },
    });
    expect(database.execute).not.toHaveBeenCalled();
    expect(cache.ping).not.toHaveBeenCalled();
    expect(queue.pingCheck).not.toHaveBeenCalled();
  });

  it('reports readiness and endpoint-cache status when dependencies respond', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      details: {
        postgres: { status: 'up' },
        redis: { status: 'up' },
        bullmq: { status: 'up' },
      },
      endpointCache: { status: 'up' },
    });
    expect(database.execute).toHaveBeenCalledTimes(1);
    expect(cache.ping).toHaveBeenCalledTimes(1);
    expect(queue.pingCheck).toHaveBeenCalledTimes(1);
  });

  it.each(['postgres', 'redis', 'bullmq'] as const)(
    'returns 503 when %s is unavailable',
    async (dependency) => {
      if (dependency === 'postgres')
        database.execute.mockRejectedValue(new Error('Unavailable'));
      if (dependency === 'redis') cache.ping.mockResolvedValue(false);
      if (dependency === 'bullmq') queue.pingCheck.mockResolvedValue(false);
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(503);
      expect(response.body).toMatchObject({
        status: 'error',
        error: { [dependency]: { status: 'down' } },
      });
    },
  );

  it('returns 503 when the heap memory limit is exceeded', async () => {
    config.healthMemoryHeapMb = '0';
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(503);
    expect(response.body).toMatchObject({
      status: 'error',
      error: { memory_heap: { status: 'down' } },
    });
  });
});
