import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Request } from 'express';
import type { CurrentUser } from '@/core/auth/auth.types';
import { NotificationStreamService } from './notification-stream.service';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: jest.fn(),
}));
jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(() => new Headers()),
}));

describe('NotificationStreamService cleanup', () => {
  const session = {
    user: { id: 'user-1' },
    session: { id: 'session-1', token: 'local-test-token' },
  } as CurrentUser;
  const connection = { id: 'connection-1', key: 'connections:user-1' };
  let service: NotificationStreamService;
  let redis: EventEmitter & { disconnect: jest.Mock };
  let release: jest.Mock;
  let request: Request;

  beforeEach(() => {
    jest.useFakeTimers();
    redis = Object.assign(new EventEmitter(), { disconnect: jest.fn() });
    release = jest.fn().mockResolvedValue(undefined);
    request = { headers: {}, destroyed: false } as Request;
    type Dependencies = ConstructorParameters<typeof NotificationStreamService>;
    service = new NotificationStreamService(
      { duplicate: () => redis } as unknown as Dependencies[0],
      {
        streamEnabled: true,
        inboxEnabled: true,
        trustedOrigins: [],
        streamHeartbeatMs: 1000,
      } as Dependencies[1],
      {
        api: { getSession: jest.fn().mockResolvedValue(session) },
      } as unknown as Dependencies[2],
      {
        acquire: jest.fn().mockResolvedValue(connection),
        release,
        renew: jest.fn().mockResolvedValue(true),
      } as unknown as Dependencies[3],
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('releases and completes if the request is destroyed before subscription', async () => {
    const observable = await service.open(request, session);
    request.destroyed = true;
    const complete = jest.fn();
    const error = jest.fn();
    const next = jest.fn();
    const subscription = observable.subscribe({ complete, error, next });

    expect(error).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(subscription.closed).toBe(true);
    expect(service.connectionCount).toBe(0);
    expect(release).toHaveBeenCalledWith(connection);
    expect(release).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('handles revocation during the initial message before heartbeat initialization', async () => {
    const observable = await service.open(request, session);
    const complete = jest.fn();
    const subscription = observable.subscribe({
      next: () => {
        redis.emit(
          'message',
          'notifications:session.revoked',
          createHash('sha256').update(session.session.token).digest('hex'),
        );
      },
      complete,
    });

    expect(subscription.closed).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(service.connectionCount).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cleans up an initialized heartbeat on unsubscribe exactly once', async () => {
    const observable = await service.open(request, session);
    const subscription = observable.subscribe();
    expect(service.connectionCount).toBe(1);
    expect(jest.getTimerCount()).toBe(1);

    subscription.unsubscribe();
    service.onModuleDestroy();

    expect(release).toHaveBeenCalledTimes(1);
    expect(service.connectionCount).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});
