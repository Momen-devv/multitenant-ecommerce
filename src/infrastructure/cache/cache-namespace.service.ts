import { EndpointCacheControls } from './endpoint-cache-controls.service';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { ENDPOINT_CACHE_CLIENT } from './cache.constants';
import { beforeDeadline } from './cache-deadline';

@Injectable()
export class CacheNamespaceService {
  constructor(
    @Inject(ENDPOINT_CACHE_CLIENT) private readonly client: Redis | null,
    private readonly controls: EndpointCacheControls,
  ) {}

  async resolve(key: string, deadline: number): Promise<string> {
    if (!this.client) throw new Error('Endpoint cache unavailable');
    let token = await beforeDeadline(deadline, () => this.client!.get(key));
    if (!token) {
      const initialized = await beforeDeadline(deadline, () =>
        this.client!.set(key, randomUUID(), 'NX'),
      );
      if (initialized) this.controls.record('infrastructure', 'namespace-init');
      token = await beforeDeadline(deadline, () => this.client!.get(key));
    }
    if (!token || !/^[0-9a-f-]{36}$/.test(token))
      throw new Error('Invalid endpoint namespace');
    return token;
  }

  async rotate(key: string, deadline: number): Promise<void> {
    if (!this.client) throw new Error('Endpoint cache unavailable');
    await beforeDeadline(deadline, () => this.client!.set(key, randomUUID()));
    this.controls.record('infrastructure', 'namespace-rotation');
  }
}
