import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { REDIS_CLIENT } from './redis.constants';
import Redis from 'ioredis';
import { LoggerService } from '../logger/logger.service';

interface ICacheService {
  set(key: string, value: string, expireInSeconds?: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<boolean>;
}
@Injectable()
export class RedisService
  implements ICacheService, OnModuleInit, OnModuleDestroy
{
  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    await this.redisClient.ping();
    this.logger.log('Redis connection verified', RedisService.name);
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
    this.logger.log('Redis connection closed gracefully', RedisService.name);
  }

  // Base Redis operations
  async set(
    key: string,
    value: string,
    expireInSeconds?: number,
  ): Promise<void> {
    if (expireInSeconds) {
      await this.redisClient.set(key, value, 'EX', expireInSeconds);
    } else {
      await this.redisClient.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.redisClient.get(key);
  }

  async del(key: string): Promise<number> {
    return this.redisClient.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redisClient.exists(key);
    return result === 1;
  }
}
