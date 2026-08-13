import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

jest.mock('@thallesp/nestjs-better-auth', () => {
  const { createParamDecorator, SetMetadata } =
    jest.requireActual('@nestjs/common');
  return {
    Roles: (roles: string[]) => SetMetadata('ROLES', roles),
    Session: createParamDecorator(
      (_data: unknown, context: ExecutionContext) =>
        context.switchToHttp().getRequest().session,
    ),
  };
});

import { PlatformStoresController } from './platform-stores.controller';
import { PlatformStoresService } from '../services/platform-stores.service';

class TestAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      session?: unknown;
    }>();
    const role = request.headers['x-role'];

    if (!role) {
      throw new UnauthorizedException();
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>('ROLES', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles && !requiredRoles.includes(role)) {
      throw new ForbiddenException();
    }

    request.session = { user: { id: 'platform-user', role } };
    return true;
  }
}

describe('PlatformStoresController HTTP adapter', () => {
  let app: INestApplication<App>;
  const platformStoresService = {
    listStores: jest.fn(),
    getStore: jest.fn(),
    suspendStore: jest.fn(),
  };

  const stores = [
    {
      id: 'store-1',
      name: 'Active Store',
      slug: 'active-store',
      description: null,
      logo: null,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      owner: { id: 'owner-1', name: 'Owner One', email: 'one@example.com' },
    },
    {
      id: 'store-2',
      name: 'Closed Store',
      slug: 'closed-store',
      description: null,
      logo: null,
      status: 'owner_closed',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      owner: { id: 'owner-2', name: 'Owner Two', email: 'two@example.com' },
    },
    {
      id: 'store-3',
      name: 'Suspended Store',
      slug: 'suspended-store',
      description: null,
      logo: null,
      status: 'platform_suspended',
      createdAt: '2026-01-03T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
      owner: {
        id: 'owner-3',
        name: 'Owner Three',
        email: 'three@example.com',
      },
    },
  ];

  beforeEach(async () => {
    jest.resetAllMocks();
    platformStoresService.listStores.mockResolvedValue(stores);
    platformStoresService.getStore.mockImplementation((storeId: string) => {
      const store = stores.find((candidate) => candidate.id === storeId);
      return store
        ? Promise.resolve(store)
        : Promise.reject(new Error('missing'));
    });
    platformStoresService.suspendStore.mockResolvedValue({
      ...stores[0],
      status: 'platform_suspended',
    });

    const module = await Test.createTestingModule({
      controllers: [PlatformStoresController],
      providers: [
        { provide: PlatformStoresService, useValue: platformStoresService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalGuards(new TestAuthGuard(new Reflector()));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists all Stores for a Platform Super-admin with only the approved owner summary', async () => {
    await request(app.getHttpServer())
      .get('/platform/stores')
      .set('x-role', 'superAdmin')
      .expect(200)
      .expect(stores);

    expect(platformStoresService.listStores).toHaveBeenCalledWith();
  });

  it.each(stores)(
    'returns a Store detail with its current $status Status',
    async (store) => {
      await request(app.getHttpServer())
        .get(`/platform/stores/${store.id}`)
        .set('x-role', 'superAdmin')
        .expect(200)
        .expect(store);
    },
  );

  it('rejects authenticated users without the Platform Super-admin role', async () => {
    await request(app.getHttpServer())
      .get('/platform/stores')
      .set('x-role', 'user')
      .expect(403);
  });

  it('rejects unauthenticated callers', async () => {
    await request(app.getHttpServer()).get('/platform/stores').expect(401);
  });

  it('returns not found for an unknown Store identifier', async () => {
    platformStoresService.getStore.mockRejectedValueOnce(
      new NotFoundException('Store not found'),
    );

    await request(app.getHttpServer())
      .get('/platform/stores/missing-store')
      .set('x-role', 'superAdmin')
      .expect(404);
  });

  it('suspends a Store for a Platform Super-admin with a normalized reason', async () => {
    await request(app.getHttpServer())
      .post('/platform/stores/store-1/suspend')
      .set('x-role', 'superAdmin')
      .send({ reason: '  Terms violation.  ' })
      .expect(200)
      .expect({ ...stores[0], status: 'platform_suspended' });

    expect(platformStoresService.suspendStore).toHaveBeenCalledWith(
      'store-1',
      'platform-user',
      'Terms violation.',
    );
  });

  it.each(['', 'short', '         ', 'a'.repeat(501)])(
    'rejects an invalid suspension reason: %s',
    async (reason) => {
      await request(app.getHttpServer())
        .post('/platform/stores/store-1/suspend')
        .set('x-role', 'superAdmin')
        .send({ reason })
        .expect(400);

      expect(platformStoresService.suspendStore).not.toHaveBeenCalled();
    },
  );

  it('rejects Store suspension for authenticated users without the Platform Super-admin role', async () => {
    await request(app.getHttpServer())
      .post('/platform/stores/store-1/suspend')
      .set('x-role', 'user')
      .send({ reason: 'Terms violation.' })
      .expect(403);
  });

  it('returns a conflict when the Store is no longer active', async () => {
    platformStoresService.suspendStore.mockRejectedValueOnce(
      new ConflictException('Invalid Store lifecycle transition'),
    );

    await request(app.getHttpServer())
      .post('/platform/stores/store-1/suspend')
      .set('x-role', 'superAdmin')
      .send({ reason: 'Terms violation.' })
      .expect(409);
  });

  it('returns not found when suspending an unknown Store', async () => {
    platformStoresService.suspendStore.mockRejectedValueOnce(
      new NotFoundException('Store not found'),
    );

    await request(app.getHttpServer())
      .post('/platform/stores/missing-store/suspend')
      .set('x-role', 'superAdmin')
      .send({ reason: 'Terms violation.' })
      .expect(404);
  });
});
