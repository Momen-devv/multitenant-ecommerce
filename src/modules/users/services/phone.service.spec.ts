import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { PhoneService } from './phone.service';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: jest.fn(),
}));
jest.mock('better-auth/node', (): { fromNodeHeaders: jest.Mock } => ({
  fromNodeHeaders: jest.fn(
    (headers: Record<string, string>) => new Headers(headers),
  ),
}));

describe('PhoneService', () => {
  let phoneService: PhoneService;
  let authService: {
    api: {
      sendPhoneNumberOTP: jest.Mock;
      verifyPhoneNumber: jest.Mock;
      updateUser: jest.Mock;
      signInPhoneNumber: jest.Mock;
      requestPasswordResetPhoneNumber: jest.Mock;
      resetPasswordPhoneNumber: jest.Mock;
    };
  };

  beforeEach(async () => {
    authService = {
      api: {
        sendPhoneNumberOTP: jest.fn(),
        verifyPhoneNumber: jest.fn(),
        updateUser: jest.fn(),
        signInPhoneNumber: jest.fn(),
        requestPasswordResetPhoneNumber: jest.fn(),
        resetPasswordPhoneNumber: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhoneService,
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    phoneService = module.get<PhoneService>(PhoneService);
  });

  const headers = { authorization: 'Bearer token' };

  it('requests an OTP for the new phone number', async () => {
    await phoneService.requestChange(
      { phoneNumber: '+201234567890' },
      null,
      false,
      headers,
    );

    expect(authService.api.sendPhoneNumberOTP).toHaveBeenCalledWith({
      body: { phoneNumber: '+201234567890' },
      headers: expect.any(Headers),
    });
  });

  it('does not send an OTP when the requested phone number is already verified', async () => {
    await expect(
      phoneService.requestChange(
        { phoneNumber: '+201234567890' },
        '+201234567890',
        true,
        headers,
      ),
    ).rejects.toThrow(
      new ConflictException('Phone number is already verified.'),
    );

    expect(authService.api.sendPhoneNumberOTP).not.toHaveBeenCalled();
  });

  it('verifies a code and updates the signed-in user phone number', async () => {
    await phoneService.confirmChange(
      { phoneNumber: '+201234567890', code: '123456' },
      headers,
    );

    expect(authService.api.verifyPhoneNumber).toHaveBeenCalledWith({
      body: {
        phoneNumber: '+201234567890',
        code: '123456',
        updatePhoneNumber: true,
        disableSession: true,
      },
      headers: expect.any(Headers),
    });
  });

  it('removes the phone number through Better Auth', async () => {
    await phoneService.remove(headers);

    expect(authService.api.updateUser).toHaveBeenCalledWith({
      body: { phoneNumber: null },
      headers: expect.any(Headers),
    });
  });

  it('signs in by phone through the server-only plugin API', async () => {
    await phoneService.signIn(
      {
        phoneNumber: '+201234567890',
        password: 'a-secure-password',
        rememberMe: true,
      },
      headers,
    );

    expect(authService.api.signInPhoneNumber).toHaveBeenCalledWith({
      body: {
        phoneNumber: '+201234567890',
        password: 'a-secure-password',
        rememberMe: true,
      },
      headers: expect.any(Headers),
      returnHeaders: true,
    });
  });

  it('requests a password-reset OTP through the server-only plugin API', async () => {
    await phoneService.requestPasswordReset(
      { phoneNumber: '+201234567890' },
      headers,
    );

    expect(
      authService.api.requestPasswordResetPhoneNumber,
    ).toHaveBeenCalledWith({
      body: { phoneNumber: '+201234567890' },
      headers: expect.any(Headers),
    });
  });

  it('resets a password through the server-only plugin API', async () => {
    await phoneService.resetPassword(
      {
        phoneNumber: '+201234567890',
        otp: '123456',
        newPassword: 'a-new-secure-password',
      },
      headers,
    );

    expect(authService.api.resetPasswordPhoneNumber).toHaveBeenCalledWith({
      body: {
        phoneNumber: '+201234567890',
        otp: '123456',
        newPassword: 'a-new-secure-password',
      },
      headers: expect.any(Headers),
    });
  });
});
