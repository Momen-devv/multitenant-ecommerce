import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthRole } from '@/common/enums';
import { PlatformUsersService } from './platform-users.service';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: jest.fn(),
}));
jest.mock('better-auth/node', () => ({
  fromNodeHeaders: (headers: Record<string, string>) => new Headers(headers),
}));
jest.mock('better-auth/api', () => ({
  isAPIError: (error: { isApiError?: boolean }) => error?.isApiError === true,
}));

describe('PlatformUsersService', () => {
  const authApi = {
    listUsers: jest.fn(),
    getUser: jest.fn(),
    createUser: jest.fn(),
    adminUpdateUser: jest.fn(),
    setRole: jest.fn(),
    banUser: jest.fn(),
    unbanUser: jest.fn(),
    listUserSessions: jest.fn(),
    revokeUserSession: jest.fn(),
    revokeUserSessions: jest.fn(),
    requestPasswordReset: jest.fn(),
  };
  const userRepository = {
    findById: jest.fn(),
    countPlatformSuperAdmins: jest.fn(),
  };
  const logger = { log: jest.fn(), error: jest.fn() };
  const headers = { cookie: 'mte.session_token=signed-token' };
  let service: PlatformUsersService;

  const user = {
    id: '01951234-1234-7000-8000-123456789abc',
    name: 'Target User',
    email: 'target@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    role: AuthRole.USER,
    banned: false,
    banReason: null,
    banExpires: null,
    imageKey: null,
    isActive: true,
    deactivatedAt: null,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PlatformUsersService(
      { api: authApi } as never,
      userRepository as never,
      logger as never,
    );
  });

  it('delegates the approved list query to Better Auth', async () => {
    authApi.listUsers.mockResolvedValue({ users: [user], total: 1 });

    await expect(
      service.listUsers(
        {
          searchValue: 'target',
          searchField: 'email' as never,
          limit: 25,
          offset: 0,
          sortBy: 'createdAt' as never,
          sortDirection: 'desc' as never,
        },
        headers,
      ),
    ).resolves.toEqual({ users: [user], total: 1 });

    expect(authApi.listUsers).toHaveBeenCalledWith({
      query: {
        searchValue: 'target',
        searchField: 'email',
        searchOperator: 'contains',
        limit: 25,
        offset: 0,
        sortBy: 'createdAt',
        sortDirection: 'desc',
      },
      headers: expect.any(Headers),
    });
  });

  it('rejects removing the current actor platform role', async () => {
    userRepository.findById.mockResolvedValue({
      ...user,
      id: 'actor-id',
      role: AuthRole.PLATFORM_SUPER_ADMIN,
    });

    await expect(
      service.setRole(
        'actor-id',
        { role: AuthRole.USER, reason: 'Routine access review' },
        'actor-id',
        headers,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authApi.setRole).not.toHaveBeenCalled();
  });

  it('protects the last platform super-admin from demotion', async () => {
    userRepository.findById.mockResolvedValue({
      ...user,
      role: AuthRole.PLATFORM_SUPER_ADMIN,
    });
    userRepository.countPlatformSuperAdmins.mockResolvedValue(1);

    await expect(
      service.setRole(
        user.id,
        { role: AuthRole.USER, reason: 'Routine access review' },
        'different-actor',
        headers,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(authApi.setRole).not.toHaveBeenCalled();
  });

  it('never exposes session tokens when listing user sessions', async () => {
    userRepository.findById.mockResolvedValue(user);
    authApi.listUserSessions.mockResolvedValue({
      sessions: [
        {
          id: 'session-id',
          userId: user.id,
          token: 'secret-session-token',
          expiresAt: new Date('2026-02-01T00:00:00.000Z'),
        },
      ],
    });

    const result = await service.listUserSessions(user.id, headers);

    expect(result.sessions).toEqual([
      {
        id: 'session-id',
        userId: user.id,
        expiresAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);
    expect(result.sessions[0]).not.toHaveProperty('token');
  });

  it('resolves a public session id to the private token before revocation', async () => {
    authApi.listUserSessions.mockResolvedValue({
      sessions: [{ id: 'session-id', userId: user.id, token: 'private-token' }],
    });
    authApi.revokeUserSession.mockResolvedValue({ success: true });

    await expect(
      service.revokeUserSession(
        user.id,
        'session-id',
        'User reported a compromised device',
        'actor-id',
        headers,
      ),
    ).resolves.toEqual({ success: true });
    expect(authApi.revokeUserSession).toHaveBeenCalledWith({
      body: { sessionToken: 'private-token' },
      headers: expect.any(Headers),
    });
  });

  it('does not call revoke for a session that does not belong to the user', async () => {
    authApi.listUserSessions.mockResolvedValue({ sessions: [] });

    await expect(
      service.revokeUserSession(
        user.id,
        'missing-session',
        'User reported a compromised device',
        'actor-id',
        headers,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(authApi.revokeUserSession).not.toHaveBeenCalled();
  });

  it('rolls back deactivation if session revocation fails', async () => {
    userRepository.findById.mockResolvedValue(user);
    authApi.adminUpdateUser
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(user);
    authApi.revokeUserSessions.mockRejectedValue(
      new Error('Redis unavailable'),
    );

    await expect(
      service.deactivateUser(
        user.id,
        'Account access was withdrawn',
        'actor-id',
        headers,
      ),
    ).rejects.toThrow('Redis unavailable');

    expect(authApi.adminUpdateUser).toHaveBeenLastCalledWith({
      body: {
        userId: user.id,
        data: { isActive: true, deactivatedAt: null },
      },
      headers: expect.any(Headers),
    });
  });

  it('translates Better Auth errors into Nest HTTP exceptions', async () => {
    authApi.getUser.mockRejectedValue({
      isApiError: true,
      statusCode: 404,
      message: 'User not found',
      body: { message: 'User not found' },
    });

    await expect(service.getUser(user.id, headers)).rejects.toMatchObject({
      status: 404,
      message: 'User not found',
    });
  });
});
