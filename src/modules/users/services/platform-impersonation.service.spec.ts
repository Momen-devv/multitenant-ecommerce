import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthRole } from '@/common/enums';
import { PlatformImpersonationService } from './platform-impersonation.service';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: jest.fn(),
}));
jest.mock('better-auth/node', () => ({
  fromNodeHeaders: (headers: Record<string, string>) => new Headers(headers),
}));
jest.mock('better-auth/api', () => ({
  isAPIError: (error: { isApiError?: boolean }) => error?.isApiError === true,
}));

describe('PlatformImpersonationService', () => {
  const authApi = {
    impersonateUser: jest.fn(),
    stopImpersonating: jest.fn(),
  };
  const userRepository = { findById: jest.fn() };
  const logger = { log: jest.fn() };
  const headers = {
    cookie: 'mte.session_token=signed-token',
    'x-real-ip': '192.0.2.10',
  };
  const targetUser = {
    id: '01951234-1234-7000-8000-123456789abc',
    role: AuthRole.USER,
  };
  let service: PlatformImpersonationService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PlatformImpersonationService(
      { api: authApi } as never,
      userRepository as never,
      logger as never,
    );
  });

  it('rejects an unknown impersonation target', async () => {
    userRepository.findById.mockResolvedValue(undefined);

    await expect(
      service.startImpersonation(
        targetUser.id,
        'Investigating a support request',
        'actor-id',
        headers,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(authApi.impersonateUser).not.toHaveBeenCalled();
  });

  it('blocks self-impersonation', async () => {
    userRepository.findById.mockResolvedValue(targetUser);

    await expect(
      service.startImpersonation(
        targetUser.id,
        'Investigating a support request',
        targetUser.id,
        headers,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(authApi.impersonateUser).not.toHaveBeenCalled();
  });

  it('blocks impersonation of a platform super-admin', async () => {
    userRepository.findById.mockResolvedValue({
      ...targetUser,
      role: `user,${AuthRole.PLATFORM_SUPER_ADMIN}`,
    });

    await expect(
      service.startImpersonation(
        targetUser.id,
        'Investigating a support request',
        'actor-id',
        headers,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authApi.impersonateUser).not.toHaveBeenCalled();
  });

  it('starts impersonation, preserves cookies, and removes the session token', async () => {
    userRepository.findById.mockResolvedValue(targetUser);
    const responseHeaders = new Headers({
      'set-cookie': 'mte.session_token=impersonated',
    });
    authApi.impersonateUser.mockResolvedValue({
      headers: responseHeaders,
      response: {
        user: targetUser,
        session: {
          id: 'session-id',
          userId: targetUser.id,
          token: 'private-token',
        },
      },
    });

    const result = await service.startImpersonation(
      targetUser.id,
      'Investigating a support request',
      'actor-id',
      headers,
    );

    expect(authApi.impersonateUser).toHaveBeenCalledWith({
      body: { userId: targetUser.id },
      headers: expect.any(Headers),
      returnHeaders: true,
    });
    expect(result.headers).toBe(responseHeaders);
    expect(result.data.session).toEqual({
      id: 'session-id',
      userId: targetUser.id,
    });
    expect(logger.log).toHaveBeenCalledWith(
      'platform_user.impersonated',
      PlatformImpersonationService.name,
      expect.objectContaining({
        actorId: 'actor-id',
        targetUserId: targetUser.id,
        ipAddress: '192.0.2.10',
      }),
    );
  });

  it('stops impersonation, preserves cookies, and audits restored identities', async () => {
    const responseHeaders = new Headers({
      'set-cookie': 'mte.session_token=restored',
    });
    authApi.stopImpersonating.mockResolvedValue({
      headers: responseHeaders,
      response: {
        user: { id: 'actor-id', role: AuthRole.PLATFORM_SUPER_ADMIN },
        session: {
          id: 'admin-session-id',
          userId: 'actor-id',
          token: 'private-admin-token',
        },
      },
    });

    const result = await service.stopImpersonation(targetUser.id, headers);

    expect(authApi.stopImpersonating).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      returnHeaders: true,
    });
    expect(result.headers).toBe(responseHeaders);
    expect(result.data.session).not.toHaveProperty('token');
    expect(logger.log).toHaveBeenCalledWith(
      'platform_user.impersonation_stopped',
      PlatformImpersonationService.name,
      expect.objectContaining({
        actorId: 'actor-id',
        targetUserId: targetUser.id,
      }),
    );
  });

  it('translates Better Auth failures into Nest HTTP exceptions', async () => {
    userRepository.findById.mockResolvedValue(targetUser);
    authApi.impersonateUser.mockRejectedValue({
      isApiError: true,
      statusCode: 403,
      message: 'Impersonation forbidden',
      body: { message: 'Impersonation forbidden' },
    });

    await expect(
      service.startImpersonation(
        targetUser.id,
        'Investigating a support request',
        'actor-id',
        headers,
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Impersonation forbidden',
    });
  });
});
