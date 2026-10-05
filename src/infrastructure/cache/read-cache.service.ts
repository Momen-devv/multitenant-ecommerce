import {
  CacheCircuitOpen,
  EndpointCacheControls,
} from './endpoint-cache-controls.service';
import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import endpointCacheConfig from '@/core/config/endpoint-cache.config';
import { ENDPOINT_CACHE_CLIENT } from './cache.constants';
import { CacheNamespaceService } from './cache-namespace.service';
import { beforeDeadline } from './cache-deadline';
import { dataKey, namespaceKey } from './cache-key';
import type {
  CacheEvent,
  CacheMeasurement,
  CacheResource,
  CacheScope,
  ReadCachePolicy,
  ReadCacheKey,
} from './read-cache.types';

const FILL = `if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
end
return nil`;

@Injectable()
export class ReadCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly loads = new Map<string, Promise<unknown>>();
  private telemetryTimer?: ReturnType<typeof setInterval>;
  private redisStats: Record<string, number> = {};
  private statsAt = 0;

  constructor(
    @Inject(ENDPOINT_CACHE_CLIENT) private readonly client: Redis | null,
    @Inject(endpointCacheConfig.KEY)
    private readonly config: ConfigType<typeof endpointCacheConfig>,
    private readonly namespaces: CacheNamespaceService,
    private readonly controls: EndpointCacheControls,
  ) {}

  record(resource: CacheResource, event: CacheEvent): void {
    this.controls.record(resource, event);
  }

  observe(
    resource: CacheResource,
    measurement: CacheMeasurement,
    value: number,
  ): void {
    this.controls.observe(resource, measurement, value);
  }

  metrics() {
    return this.controls.snapshot();
  }

  health() {
    const circuit = this.controls.snapshot().circuit;
    return {
      required: false,
      status: !this.config.enabled
        ? 'disabled'
        : !this.client || this.client.status !== 'ready' || circuit !== 'closed'
          ? 'degraded'
          : 'up',
      ...this.metrics(),
      redis: { values: this.redisStats, sampledAt: this.statsAt || null },
    };
  }

  load<T>(
    resource: CacheResource,
    work: () => Promise<T>,
    deadline?: number,
  ): Promise<T> {
    return this.controls.database(resource, work, deadline);
  }

  private async fallback<T>(
    policy: ReadCachePolicy<T>,
    resource: CacheResource,
    load: () => Promise<T>,
    deadline: number,
  ): Promise<T> {
    const key = `fallback:${namespaceKey(this.config.environment, policy.scope, this.config.prefix)}:${policy.resource}:v${policy.schemaVersion}:${policy.keyHash}`;
    const existing = this.loads.get(key);
    if (existing) {
      this.record(resource, 'coalesced');
      return this.controls.wait(deadline, () => existing as Promise<T>);
    }
    if (this.loads.size >= this.config.maxTrackedLoads) {
      this.record(resource, 'capacity-rejected');
      throw new ServiceUnavailableException(
        'Public read capacity temporarily unavailable',
      );
    }
    let settled = false;
    let finished = false;
    const promise = this.controls.database(resource, load, deadline, () => {
      settled = true;
      if (finished && this.loads.get(key) === promise) this.loads.delete(key);
    });
    this.loads.set(key, promise);
    try {
      return await promise;
    } finally {
      finished = true;
      if (settled && this.loads.get(key) === promise) this.loads.delete(key);
    }
  }

  private async sampleRedis(): Promise<void> {
    if (!this.client) return;
    try {
      const info = await this.controls.redis('infrastructure', () =>
        beforeDeadline(performance.now() + this.config.attemptTimeoutMs, () =>
          this.client!.info(),
        ),
      );
      const fields = ['used_memory', 'maxmemory', 'evicted_keys'];
      const values: Record<string, number> = {};
      for (const field of fields) {
        const value = info.match(new RegExp(`^${field}:(\\d+)`, 'm'))?.[1];
        if (value) values[field] = Number(value);
      }
      this.redisStats = values;
      this.statsAt = Date.now();
    } catch (error) {
      if (!(error instanceof CacheCircuitOpen))
        this.record('infrastructure', 'error');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) return;
    try {
      await this.controls.redis('infrastructure', () =>
        beforeDeadline(performance.now() + this.config.attemptTimeoutMs, () =>
          this.client!.connect(),
        ),
      );
    } catch {
      this.record('infrastructure', 'error');
    }
    this.telemetryTimer = setInterval(() => {
      void this.sampleRedis();
    }, 60000);
    this.telemetryTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.controls.stop();
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
    if (!this.client) return;
    try {
      await beforeDeadline(
        performance.now() + this.config.shutdownTimeoutMs,
        () => this.client!.quit(),
      );
    } catch {
      this.record('infrastructure', 'error');
    } finally {
      this.client.disconnect();
    }
  }

  async remember<T>(
    policy: ReadCachePolicy<T>,
    load: () => Promise<T>,
    loadDeadline = performance.now() + this.config.loadTimeoutMs,
  ): Promise<T> {
    const resource = policy.metricResource ?? policy.resource;
    if (
      !this.config.enabled ||
      !policy.eligible ||
      !this.client ||
      !Number.isFinite(policy.ttlSeconds) ||
      policy.ttlSeconds <= 0
    ) {
      this.record(resource, 'bypass');
      return this.fallback(policy, resource, load, loadDeadline);
    }
    const namespace = namespaceKey(
      this.config.environment,
      policy.scope,
      this.config.prefix,
    );
    const deadline = Math.min(
      loadDeadline,
      performance.now() + this.config.attemptTimeoutMs,
    );
    let token = '';
    let key = '';
    try {
      const cached = await this.controls.redis(resource, async () => {
        token = await this.namespaces.resolve(namespace, deadline);
        key = dataKey(namespace, token, policy);
        const payload = await beforeDeadline(deadline, () =>
          this.client!.get(key),
        );
        if (payload === null) return { found: false as const };
        this.controls.observe(
          resource,
          'payload-bytes',
          Buffer.byteLength(payload),
        );
        try {
          if (Buffer.byteLength(payload) > this.config.maxPayloadBytes) {
            this.record(resource, 'oversized');
            throw new Error('Oversized payload');
          }
          return { found: true as const, value: policy.codec.decode(payload) };
        } catch {
          this.record(resource, 'malformed');
          await beforeDeadline(deadline, () => this.client!.del(key));
          return { found: false as const };
        }
      });
      if (cached.found) {
        this.record(resource, 'hit');
        return cached.value;
      }
    } catch (error) {
      this.record(
        resource,
        error instanceof CacheCircuitOpen ? 'bypass' : 'error',
      );
      return this.fallback(policy, resource, load, loadDeadline);
    }
    this.record(resource, 'miss');
    const existing = this.loads.get(key);
    if (existing) {
      this.record(resource, 'coalesced');
      return this.controls.wait(loadDeadline, () => existing as Promise<T>);
    }
    if (this.loads.size >= this.config.maxTrackedLoads) {
      this.record(resource, 'capacity-rejected');
      throw new ServiceUnavailableException(
        'Public read capacity temporarily unavailable',
      );
    }
    let settled = false;
    let finished = false;
    const run = async (): Promise<T> => {
      const started = performance.now();
      const freshnessMs =
        policy.ttlSeconds * 1000 * (0.9 + Math.random() * 0.2);
      // Loader errors stay outside cache catches and are never retried.
      const value = await this.controls.database(
        resource,
        load,
        loadDeadline,
        () => {
          settled = true;
          // Retain a timed-out coalescing entry until the actual loader settles.
          if (finished && this.loads.get(key) === promise)
            this.loads.delete(key);
        },
      );
      try {
        const payload = policy.codec.encode(value);
        policy.codec.decode(payload);
        this.controls.observe(
          resource,
          'payload-bytes',
          Buffer.byteLength(payload),
        );
        if (Buffer.byteLength(payload) > this.config.maxPayloadBytes) {
          this.record(resource, 'oversized');
          return value;
        }
        const ttlMs = Math.floor(freshnessMs - (performance.now() - started));
        if (ttlMs > 0) {
          // Lookup and fill share one cache-time budget, excluding database time.
          const fillDeadline = Math.min(
            loadDeadline,
            deadline + (performance.now() - started),
          );
          const filled = await this.controls.redis(resource, () =>
            beforeDeadline(fillDeadline, () =>
              this.client!.eval(FILL, 2, namespace, key, token, payload, ttlMs),
            ),
          );
          if (!filled) this.record(resource, 'fill-skipped');
        }
      } catch (error) {
        this.record(
          resource,
          error instanceof CacheCircuitOpen ? 'bypass' : 'error',
        );
      }
      return value;
    };
    const promise = run();
    this.loads.set(key, promise);
    try {
      return await promise;
    } finally {
      finished = true;
      if (settled && this.loads.get(key) === promise) this.loads.delete(key);
    }
  }

  async invalidate(
    scope: CacheScope,
    policies: ReadCacheKey[],
    resource: CacheResource = 'plan-detail',
  ): Promise<void> {
    if (!this.client) return;
    const namespace = namespaceKey(
      this.config.environment,
      scope,
      this.config.prefix,
    );
    // Reserve a separate bounded rotation attempt even when deletion times out.
    try {
      await this.controls.redis(resource, async () => {
        const deadline = performance.now() + this.config.attemptTimeoutMs;
        if (policies.length) {
          const token = await this.namespaces.resolve(namespace, deadline);
          const keys = policies.map((policy) =>
            dataKey(namespace, token, policy),
          );
          await beforeDeadline(deadline, () => this.client!.del(...keys));
        }
      });
    } catch {
      this.record(resource, 'invalidation-error');
    }
    try {
      await this.controls.redis(resource, () =>
        this.namespaces.rotate(
          namespace,
          performance.now() + this.config.attemptTimeoutMs,
        ),
      );
      this.record(resource, 'invalidation-success');
    } catch {
      this.record(resource, 'invalidation-error');
    }
  }
}
