import {
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Redis } from 'ioredis';
import { CodedHttpError } from '@/common/errors';
import type { CurrentUser } from '@/core/auth/auth.types';
import { CACHE_CLIENT } from '@/infrastructure/cache/cache.constants';

export type CommerceRateLimit = 'read' | 'cart-change';
export const COMMERCE_RATE_LIMIT_KEY = 'commerce-rate-limit';

const LIMITS: Record<CommerceRateLimit, number> = {
  read: 60,
  'cart-change': 30,
};

export const CommerceThrottle = (limit: CommerceRateLimit) =>
  SetMetadata(COMMERCE_RATE_LIMIT_KEY, limit);

type CommerceRequest = { session?: CurrentUser };

/**
 * Separate authenticated-user buckets complement, rather than replace, the
 * application's global IP buckets. Later commerce controllers reuse the same
 * decorator for quote, checkout, and order action limits.
 */
@Injectable()
export class CommerceUserThrottlerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CACHE_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const limit = this.reflector.getAllAndOverride<CommerceRateLimit>(
      COMMERCE_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!limit) return true;

    const request = context.switchToHttp().getRequest<CommerceRequest>();
    const userId = request.session?.user.id;
    // Authentication still owns the anonymous response. This guard only adds
    // a user-scoped bucket once AuthGuard has produced a session.
    if (!userId) return true;

    const bucket = Math.floor(Date.now() / 60_000);
    const key = `commerce-rate:${limit}:${userId}:${bucket}`;
    const value = await this.redis.incr(key);
    if (value === 1) await this.redis.expire(key, 60);
    if (value > LIMITS[limit]) {
      throw new CodedHttpError(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        'Too many requests. Please try again shortly.',
      );
    }
    return true;
  }
}
