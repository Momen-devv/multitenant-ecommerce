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
  const activeStoreId = '19ffb5c0-b6a9-7ba5-90d6-ffccc9e57934';
  const closedStoreId = '29ffb5c0-b6a9-7ba5-90d6-ffccc9e57934';
  const suspendedStoreId = '39ffb5c0-b6a9-7ba5-90d6-ffccc9e57934';
  const missingStoreId = '49ffb5c0-b6a9-7ba5-90d6-ffccc9e57934';
  const platformStoresService = {
    listStores: jest.fn(),
    getStore: jest.fn(),
    suspendStore: jest.fn(),
    reactivateStore: jest.fn(),
  };

  const stores = [
    {
      id: activeStoreId,
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
      id: closedStoreId,
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
      id: suspendedStoreId,
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
    platformStoresService.listStores.mockResolvedValue({
      items: stores,
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
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
    platformStoresService.reactivateStore.mockImplementation(
      (storeId: string) => {
        const store = stores.find((candidate) => candidate.id === storeId)!;
        return Promise.resolve({ ...store, status: 'active' });
      },
    );

    const module = await Test.createTestingModule({
      controllers: [PlatformStoresController],
      providers: [
        { provide: PlatformStoresService, useValue: platformStoresService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.getHttpAdapter().getInstance().set('query parser', 'extended');
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

  it('lists a filtered Store page for a Platform Super-admin', async () => {
    await request(app.getHttpServer())
      .get(
        '/platform/stores?limit=2&sort=name&search=store&fields=id,name&filter[status][eq]=active',
      )
      .set('x-role', 'superAdmin')
      .expect(200)
      .expect({
        items: stores,
        pageInfo: { nextCursor: null, hasNextPage: false },
      });

    expect(platformStoresService.listStores).toHaveBeenCalledWith({
      limit: 2,
      sort: 'name',
      search: 'store',
      fields: 'id,name',
      filter: { status: { eq: 'active' } },
    });
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
      .get(`/platform/stores/${missingStoreId}`)
      .set('x-role', 'superAdmin')
      .expect(404);
  });

  it('rejects a malformed Store UUID before calling the service', async () => {
    await request(app.getHttpServer())
      .get('/platform/stores/not-a-uuid')
      .set('x-role', 'superAdmin')
      .expect(400);

    expect(platformStoresService.getStore).not.toHaveBeenCalled();
  });

  it('suspends a Store for a Platform Super-admin with a normalized reason', async () => {
    await request(app.getHttpServer())
      .post(`/platform/stores/${activeStoreId}/suspend`)
      .set('x-role', 'superAdmin')
      .send({ reason: '  Terms violation.  ' })
      .expect(200)
      .expect({ ...stores[0], status: 'platform_suspended' });

    expect(platformStoresService.suspendStore).toHaveBeenCalledWith(
      activeStoreId,
      'platform-user',
      'Terms violation.',
    );
  });

  it('requires a reason when suspending', async () => {
    await request(app.getHttpServer())
      .post(`/platform/stores/${activeStoreId}/suspend`)
      .set('x-role', 'superAdmin')
      .send({})
      .expect(400);

    expect(platformStoresService.suspendStore).not.toHaveBeenCalled();
  });

  it('rejects a malformed Store UUID when suspending', async () => {
    await request(app.getHttpServer())
      .post('/platform/stores/not-a-uuid/suspend')
      .set('x-role', 'superAdmin')
      .send({ reason: 'Terms violation.' })
      .expect(400);

    expect(platformStoresService.suspendStore).not.toHaveBeenCalled();
  });

  it.each(['', 'short', '         ', 'a'.repeat(501)])(
    'rejects an invalid suspension reason: %s',
    async (reason) => {
      await request(app.getHttpServer())
        .post(`/platform/stores/${activeStoreId}/suspend`)
        .set('x-role', 'superAdmin')
        .send({ reason })
        .expect(400);

      expect(platformStoresService.suspendStore).not.toHaveBeenCalled();
    },
  );

  it('rejects Store suspension for authenticated users without the Platform Super-admin role', async () => {
    await request(app.getHttpServer())
      .post(`/platform/stores/${activeStoreId}/suspend`)
      .set('x-role', 'user')
      .send({ reason: 'Terms violation.' })
      .expect(403);
  });

  it('returns a conflict when the Store is no longer active', async () => {
    platformStoresService.suspendStore.mockRejectedValueOnce(
      new ConflictException('Invalid Store lifecycle transition'),
    );

    await request(app.getHttpServer())
      .post(`/platform/stores/${activeStoreId}/suspend`)
      .set('x-role', 'superAdmin')
      .send({ reason: 'Terms violation.' })
      .expect(409);
  });

  it('returns not found when suspending an unknown Store', async () => {
    platformStoresService.suspendStore.mockRejectedValueOnce(
      new NotFoundException('Store not found'),
    );

    await request(app.getHttpServer())
      .post(`/platform/stores/${missingStoreId}/suspend`)
      .set('x-role', 'superAdmin')
      .send({ reason: 'Terms violation.' })
      .expect(404);
  });

  it.each(['owner_closed', 'platform_suspended'] as const)(
    'reactivates a %s Store for a Platform Super-admin with a normalized reason',
    async (status) => {
      const store = stores.find((candidate) => candidate.status === status)!;
      await request(app.getHttpServer())
        .post(`/platform/stores/${store.id}/reactivate`)
        .set('x-role', 'superAdmin')
        .send({ reason: '  Issue resolved and approved.  ' })
        .expect(200)
        .expect({ ...store, status: 'active' });

      expect(platformStoresService.reactivateStore).toHaveBeenCalledWith(
        store.id,
        'platform-user',
        'Issue resolved and approved.',
      );
    },
  );

  it('requires a reason when reactivating', async () => {
    await request(app.getHttpServer())
      .post(`/platform/stores/${closedStoreId}/reactivate`)
      .set('x-role', 'superAdmin')
      .send({})
      .expect(400);

    expect(platformStoresService.reactivateStore).not.toHaveBeenCalled();
  });

  it('rejects a malformed Store UUID when reactivating', async () => {
    await request(app.getHttpServer())
      .post('/platform/stores/not-a-uuid/reactivate')
      .set('x-role', 'superAdmin')
      .send({ reason: 'Issue resolved and approved.' })
      .expect(400);

    expect(platformStoresService.reactivateStore).not.toHaveBeenCalled();
  });

  it.each(['', 'short', '         ', 'a'.repeat(501)])(
    'rejects an invalid reactivation reason: %s',
    async (reason) => {
      await request(app.getHttpServer())
        .post(`/platform/stores/${closedStoreId}/reactivate`)
        .set('x-role', 'superAdmin')
        .send({ reason })
        .expect(400);

      expect(platformStoresService.reactivateStore).not.toHaveBeenCalled();
    },
  );

  it('rejects Store reactivation for authenticated users without the Platform Super-admin role', async () => {
    await request(app.getHttpServer())
      .post(`/platform/stores/${closedStoreId}/reactivate`)
      .set('x-role', 'user')
      .send({ reason: 'Issue resolved and approved.' })
      .expect(403);
  });

  it('returns a conflict when reactivating an active Store', async () => {
    platformStoresService.reactivateStore.mockRejectedValueOnce(
      new ConflictException('Invalid Store lifecycle transition'),
    );

    await request(app.getHttpServer())
      .post(`/platform/stores/${activeStoreId}/reactivate`)
      .set('x-role', 'superAdmin')
      .send({ reason: 'Issue resolved and approved.' })
      .expect(409);
  });

  it('rejects Store reactivation by an unauthenticated Store Owner', async () => {
    await request(app.getHttpServer())
      .post(`/platform/stores/${closedStoreId}/reactivate`)
      .send({ reason: 'Issue resolved and approved.' })
      .expect(401);
  });
});
