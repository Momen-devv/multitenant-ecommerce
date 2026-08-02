import { Test, TestingModule } from '@nestjs/testing';
import { AccountController } from './account.controller';
import { AccountService } from '../services/account.service';
import type { CurrentUser } from '@/core/auth/auth.types';
import type { Response } from 'express';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: jest.fn(),
  AllowAnonymous: jest.fn(() => () => {}),
}));
jest.mock('better-auth/node', (): { fromNodeHeaders: jest.Mock } => ({
  fromNodeHeaders: jest.fn(
    (headers: Record<string, string>) => new Headers(headers),
  ),
}));
jest.mock('better-auth', () => ({
  isProduction: false,
}));

describe('AccountController', () => {
  let controller: AccountController;
  let accountService: {
    deactivateAccount: jest.Mock;
    requestReactivation: jest.Mock;
    confirmReactivation: jest.Mock;
  };

  beforeEach(async () => {
    accountService = {
      deactivateAccount: jest.fn(),
      requestReactivation: jest.fn(),
      confirmReactivation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountController],
      providers: [{ provide: AccountService, useValue: accountService }],
    }).compile();

    controller = module.get<AccountController>(AccountController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('deactivateAccount', () => {
    const session = {
      user: { id: 'user-123', email: 'ahmed@example.com' },
    } as CurrentUser;
    const headers = { authorization: 'Bearer token123' };

    it('should call accountService.deactivateAccount with the correct params and clear the session cookie', async () => {
      const res = { clearCookie: jest.fn() } as unknown as Response;
      accountService.deactivateAccount.mockResolvedValue(undefined);

      await controller.deactivateAccount(session, headers, res);

      expect(accountService.deactivateAccount).toHaveBeenCalledWith(
        session.user.id,
        session.user.email,
        headers,
      );
      expect(res.clearCookie).toHaveBeenCalledWith('mte.session_token', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      });
    });

    it('should propagate the error if accountService.deactivateAccount throws', async () => {
      const res = { clearCookie: jest.fn() } as unknown as Response;
      const error = new Error('deactivation failed');
      accountService.deactivateAccount.mockRejectedValue(error);

      await expect(
        controller.deactivateAccount(session, headers, res),
      ).rejects.toThrow('deactivation failed');

      expect(res.clearCookie).not.toHaveBeenCalled();
    });
  });

  describe('requestReactivation', () => {
    it('should call accountService.requestReactivation with the correct email', async () => {
      const dto = { email: 'ahmed@example.com' };
      accountService.requestReactivation.mockResolvedValue(undefined);

      await controller.requestReactivation(dto);

      expect(accountService.requestReactivation).toHaveBeenCalledWith(
        dto.email,
      );
    });
  });

  describe('confirmReactivation', () => {
    it('should call accountService.confirmReactivation with the correct token and userId', async () => {
      const dto = { token: 'raw-token', userId: 'user-123' };
      accountService.confirmReactivation.mockResolvedValue(undefined);

      await controller.confirmReactivation(dto);

      expect(accountService.confirmReactivation).toHaveBeenCalledWith(
        dto.token,
        dto.userId,
      );
    });
  });
});
