import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import endpointCacheConfig from '@/core/config/endpoint-cache.config';
import { LoggerService } from '../logger/logger.service';
import { beforeDeadline, CacheDeadlineExceeded } from './cache-deadline';
import type {
  CacheEvent,
  CacheMeasurement,
  CacheResource,
} from './read-cache.types';

export class CacheCircuitOpen extends Error {}

@Injectable()
export class EndpointCacheControls {
  private failures = 0;
  private openUntil = 0;
  private probe = false;
  private generation = 0;
  private active = 0;
  private peak = 0;
  private stopping = false;
  private lastWarning = -Infinity;
  private readonly counters = new Map<string, number>();
  private readonly observations = new Map<
    string,
    { count: number; sum: number; max: number }
  >();

  constructor(
    @Inject(endpointCacheConfig.KEY)
    private readonly config: ConfigType<typeof endpointCacheConfig>,
    private readonly logger: LoggerService,
  ) {}

  record(resource: CacheResource, event: CacheEvent): void {
    const label = `${resource}:${event}`;
    this.counters.set(label, (this.counters.get(label) ?? 0) + 1);
    if (
      (event === 'error' || event === 'invalidation-error') &&
      performance.now() - this.lastWarning > 60000
    ) {
      this.lastWarning = performance.now();
      this.logger.warn(
        'Endpoint cache degraded; database remains authoritative',
        EndpointCacheControls.name,
        { resource, event },
      );
    }
  }

  observe(
    resource: CacheResource,
    measurement: CacheMeasurement,
    value: number,
  ): void {
    const label = `${resource}:${measurement}`;
    const current = this.observations.get(label) ?? {
      count: 0,
      sum: 0,
      max: 0,
    };
    current.count++;
    current.sum += value;
    current.max = Math.max(current.max, value);
    this.observations.set(label, current);
  }

  snapshot() {
    return {
      circuit: this.probe ? 'half-open' : this.openUntil ? 'open' : 'closed',
      retryAfterMs: Math.max(0, this.openUntil - performance.now()),
      fallback: {
        active: this.active,
        peak: this.peak,
        limit: this.config.maxConcurrentLoads,
        queued: 0,
      },
      counters: Object.fromEntries(this.counters),
      observations: Object.fromEntries(this.observations),
    };
  }

  stop(): void {
    this.stopping = true;
  }

  async redis<T>(resource: CacheResource, work: () => Promise<T>): Promise<T> {
    if (
      this.stopping ||
      !this.config.enabled ||
      this.probe ||
      performance.now() < this.openUntil
    )
      throw new CacheCircuitOpen();
    const recovering = this.openUntil !== 0;
    if (recovering) this.probe = true;
    const generation = this.generation;
    const started = performance.now();
    try {
      const result = await work();
      if (generation === this.generation) {
        this.failures = 0;
        this.openUntil = 0;
      }
      return result;
    } catch (error) {
      if (
        generation === this.generation &&
        (recovering || ++this.failures >= this.config.breakerThreshold)
      ) {
        this.openUntil = performance.now() + this.config.breakerCooldownMs;
        this.generation++;
      }
      throw error;
    } finally {
      if (recovering) this.probe = false;
      this.observe(resource, 'redis-ms', performance.now() - started);
    }
  }

  async database<T>(
    resource: CacheResource,
    load: () => Promise<T>,
    deadline = performance.now() + this.config.loadTimeoutMs,
    settled?: () => void,
  ): Promise<T> {
    if (
      deadline <= performance.now() ||
      this.stopping ||
      this.active >= this.config.maxConcurrentLoads
    ) {
      settled?.();
      this.record(resource, 'capacity-rejected');
      throw new ServiceUnavailableException(
        'Public read capacity temporarily unavailable',
      );
    }
    this.active++;
    this.peak = Math.max(this.peak, this.active);
    const started = performance.now();
    // Keep the permit until actual database settlement, even after caller timeout.
    const pending = Promise.resolve()
      .then(() => {
        if (deadline <= performance.now()) throw new CacheDeadlineExceeded();
        return load();
      })
      .finally(() => {
        this.active--;
        settled?.();
        this.observe(resource, 'loader-ms', performance.now() - started);
      });
    return this.wait(deadline, () => pending);
  }

  async wait<T>(deadline: number, work: () => Promise<T>): Promise<T> {
    try {
      return await beforeDeadline(deadline, work);
    } catch (error) {
      if (error instanceof CacheDeadlineExceeded)
        throw new ServiceUnavailableException('Public read deadline exceeded');
      throw error;
    }
  }
}
