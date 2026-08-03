import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AccountService } from './account.service';
import { CACHE_SERVICE } from '@/common/constants/injection-tokens.constants';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { EmailQueueService } from '@/infrastructure/queue/email/email-queue.service';
import { AccountRepository } from '../repos';
import appConfig from '@/core/config/app.config';
import { SecureTokenService } from '@/common/services/secure-token.service';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: jest.fn(),
}));
jest.mock('better-auth/node', (): { fromNodeHeaders: jest.Mock } => ({
  fromNodeHeaders: jest.fn(
    (headers: Record<string, string>) => new Headers(headers),
  ),
}));

describe('AccountService', () => {
  let accountService: AccountService;
  let cacheService: { setex: jest.Mock; get: jest.Mock; del: jest.Mock };
  let authService: {
    api: { updateUser: jest.Mock; revokeSessions: jest.Mock };
  };
  let logger: { log: jest.Mock; error: jest.Mock };
  let emailQueue: {
    addAccountDeactivatedJob: jest.Mock;
    addAccountReactivationJob: jest.Mock;
  };
  let accountRepository: { findByEmail: jest.Mock; updateUser: jest.Mock };
  let secureToken: { generate: jest.Mock; verify: jest.Mock };

  const headers = { authorization: 'Bearer token123' };
  const config = { baseUrl: 'https://example.com' };

  beforeEach(async () => {
    cacheService = { setex: jest.fn(), get: jest.fn(), del: jest.fn() };
    authService = {
      api: { updateUser: jest.fn(), revokeSessions: jest.fn() },
    };
    logger = { log: jest.fn(), error: jest.fn() };
    emailQueue = {
      addAccountDeactivatedJob: jest.fn(),
      addAccountReactivationJob: jest.fn(),
    };
    accountRepository = { findByEmail: jest.fn(), updateUser: jest.fn() };
    secureToken = { generate: jest.fn(), verify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        { provide: CACHE_SERVICE, useValue: cacheService },
        { provide: appConfig.KEY, useValue: config },
        { provide: AuthService, useValue: authService },
        { provide: LoggerService, useValue: logger },
        { provide: EmailQueueService, useValue: emailQueue },
        { provide: AccountRepository, useValue: accountRepository },
        { provide: SecureTokenService, useValue: secureToken },
      ],
    }).compile();

    accountService = module.get<AccountService>(AccountService);
  });

  it('should be defined', () => {
    expect(accountService).toBeDefined();
  });

  describe('deactivateAccount', () => {
    const userId = 'user-123';
    const email = 'ahmed@example.com';

    describe('happy path', () => {
      it('should deactivate, revoke sessions, enqueue email, and log success', async () => {
        authService.api.updateUser.mockResolvedValue(undefined);
        authService.api.revokeSessions.mockResolvedValue(undefined);
        emailQueue.addAccountDeactivatedJob.mockResolvedValue(undefined);

        await accountService.deactivateAccount(userId, email, headers);

        expect(authService.api.updateUser).toHaveBeenCalledTimes(1);
        expect(authService.api.updateUser).toHaveBeenCalledWith({
          body: { isActive: false, deactivatedAt: expect.any(Date) },
          headers: expect.any(Headers),
        });
        expect(authService.api.revokeSessions).toHaveBeenCalledWith({
          headers: expect.any(Headers),
        });
        expect(emailQueue.addAccountDeactivatedJob).toHaveBeenCalledWith(email);
        expect(logger.log).toHaveBeenCalledWith(
          'Account deactivated',
          AccountService.name,
          { userId },
        );
      });
    });

    describe('when addAccountDeactivatedJob fails to enqueue', () => {
      it('should log the error but still resolve successfully', async () => {
        authService.api.updateUser.mockResolvedValue(undefined);
        authService.api.revokeSessions.mockResolvedValue(undefined);
        const enqueueError = new Error('queue is down');
        emailQueue.addAccountDeactivatedJob.mockRejectedValue(enqueueError);

        await expect(
          accountService.deactivateAccount(userId, email, headers),
        ).resolves.toBeUndefined();

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to enqueue deactivation notice email',
          enqueueError,
          AccountService.name,
        );
        expect(logger.log).toHaveBeenCalledWith(
          'Account deactivated',
          AccountService.name,
          { userId },
        );
      });
    });

    describe('when the initial updateUser (isActive: false) fails', () => {
      it('should propagate the error and never call revokeSessions or notify', async () => {
        const error = new Error('updateUser failed');
        authService.api.updateUser.mockRejectedValue(error);

        await expect(
          accountService.deactivateAccount(userId, email, headers),
        ).rejects.toThrow('updateUser failed');

        expect(authService.api.revokeSessions).not.toHaveBeenCalled();
        expect(emailQueue.addAccountDeactivatedJob).not.toHaveBeenCalled();
        expect(logger.log).not.toHaveBeenCalled();
      });
    });

    describe('when revokeSessions fails', () => {
      it('should roll back isActive, rethrow, and never notify', async () => {
        authService.api.updateUser.mockResolvedValue(undefined);
        const revokeError = new Error('revokeSessions failed');
        authService.api.revokeSessions.mockRejectedValue(revokeError);

        await expect(
          accountService.deactivateAccount(userId, email, headers),
        ).rejects.toThrow('revokeSessions failed');

        expect(authService.api.updateUser).toHaveBeenCalledTimes(2);
        expect(authService.api.updateUser).toHaveBeenNthCalledWith(1, {
          body: { isActive: false, deactivatedAt: expect.any(Date) },
          headers: expect.any(Headers),
        });
        expect(authService.api.updateUser).toHaveBeenNthCalledWith(2, {
          body: { isActive: true, deactivatedAt: null },
          headers: expect.any(Headers),
        });

        expect(emailQueue.addAccountDeactivatedJob).not.toHaveBeenCalled();
        expect(logger.log).not.toHaveBeenCalled();
      });

      it('should still rethrow the original error even if the rollback itself fails', async () => {
        authService.api.updateUser
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('rollback failed'));

        const revokeError = new Error('revokeSessions failed');
        authService.api.revokeSessions.mockRejectedValue(revokeError);

        await expect(
          accountService.deactivateAccount(userId, email, headers),
        ).rejects.toThrow('revokeSessions failed');

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to rollback isActive after revokeSessions failure',
          new Error('rollback failed'),
          AccountService.name,
        );
      });
    });
  });

  describe('requestReactivation', () => {
    const email = 'ahmed@example.com';

    describe('when no user is found', () => {
      it('should return immediately without calling any dependency', async () => {
        accountRepository.findByEmail.mockResolvedValue(null);

        await accountService.requestReactivation(email);

        expect(secureToken.generate).not.toHaveBeenCalled();
        expect(cacheService.setex).not.toHaveBeenCalled();
        expect(emailQueue.addAccountReactivationJob).not.toHaveBeenCalled();
      });
    });

    describe('when the user is already active', () => {
      it('should return immediately without calling any dependency', async () => {
        accountRepository.findByEmail.mockResolvedValue({
          id: 'user-123',
          isActive: true,
        });

        await accountService.requestReactivation(email);

        expect(secureToken.generate).not.toHaveBeenCalled();
        expect(cacheService.setex).not.toHaveBeenCalled();
        expect(emailQueue.addAccountReactivationJob).not.toHaveBeenCalled();
      });
    });

    describe('when the user exists and is inactive', () => {
      it('should generate a token, cache it, and enqueue the reactivation email', async () => {
        accountRepository.findByEmail.mockResolvedValue({
          id: 'user-123',
          isActive: false,
        });
        secureToken.generate.mockReturnValue({
          token: 'raw-token',
          hashedToken: 'hashed-token',
        });
        cacheService.setex.mockResolvedValue(undefined);
        emailQueue.addAccountReactivationJob.mockResolvedValue(undefined);

        await accountService.requestReactivation(email);

        expect(cacheService.setex).toHaveBeenCalledWith(
          'account-reactivation:user-123',
          60 * 15,
          'hashed-token',
        );
        expect(emailQueue.addAccountReactivationJob).toHaveBeenCalledWith(
          email,
          'https://example.com/api/v1/users/account/reactivate/confirm?token=raw-token&userId=user-123',
        );
      });

      it('should log the error if the reactivation email fails to enqueue', async () => {
        accountRepository.findByEmail.mockResolvedValue({
          id: 'user-123',
          isActive: false,
        });
        secureToken.generate.mockReturnValue({
          token: 'raw-token',
          hashedToken: 'hashed-token',
        });
        cacheService.setex.mockResolvedValue(undefined);
        const enqueueError = new Error('queue is down');
        emailQueue.addAccountReactivationJob.mockRejectedValue(enqueueError);

        await expect(
          accountService.requestReactivation(email),
        ).resolves.toBeUndefined();

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to enqueue reactivation email',
          enqueueError,
          AccountService.name,
        );
      });
    });
  });

  describe('confirmReactivation', () => {
    const userId = 'user-123';
    const token = 'raw-token';

    describe('when no cached token exists', () => {
      it('should throw BadRequestException and never update the user', async () => {
        cacheService.get.mockResolvedValue(null);

        await expect(
          accountService.confirmReactivation(token, userId),
        ).rejects.toThrow(BadRequestException);

        expect(accountRepository.updateUser).not.toHaveBeenCalled();
        expect(cacheService.del).not.toHaveBeenCalled();
      });
    });

    describe('when the token does not match', () => {
      it('should throw BadRequestException and never update the user', async () => {
        cacheService.get.mockResolvedValue('hashed-token');
        secureToken.verify.mockReturnValue(false);

        await expect(
          accountService.confirmReactivation(token, userId),
        ).rejects.toThrow(BadRequestException);

        expect(accountRepository.updateUser).not.toHaveBeenCalled();
        expect(cacheService.del).not.toHaveBeenCalled();
      });
    });

    describe('when the token is valid', () => {
      it('should activate the user, clear the cache, and log success', async () => {
        cacheService.get.mockResolvedValue('hashed-token');
        secureToken.verify.mockReturnValue(true);
        accountRepository.updateUser.mockResolvedValue(undefined);
        cacheService.del.mockResolvedValue(undefined);

        await accountService.confirmReactivation(token, userId);

        expect(accountRepository.updateUser).toHaveBeenCalledWith(userId, {
          isActive: true,
          deactivatedAt: null,
        });
        expect(cacheService.del).toHaveBeenCalledWith(
          `account-reactivation:${userId}`,
        );
        expect(logger.log).toHaveBeenCalledWith(
          'Account reactivated',
          AccountService.name,
          { userId },
        );
      });
    });
  });
});
