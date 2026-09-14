jest.mock('better-auth/minimal', () => ({
  betterAuth: jest.fn((options) => ({
    api: {
      createOrganization: jest.fn(),
      updateOrganization: jest.fn(),
    },
    options,
  })),
}));
jest.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: jest.fn(() => ({})),
}));
const mockPhoneNumber = jest.fn((options) => ({
  id: 'phone-number',
  options,
}));

jest.mock('better-auth/plugins', () => ({
  admin: jest.fn(() => ({ id: 'admin' })),
  openAPI: jest.fn(() => ({ id: 'open-api' })),
  organization: jest.fn(() => ({ id: 'organization' })),
  phoneNumber: mockPhoneNumber,
}));
jest.mock('better-auth', () => ({ isProduction: false }));
jest.mock('@/common/utils', () => ({
  generateUUIDv7: jest.fn(),
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
}));
jest.mock('./permissions', () => ({
  ac: {},
  platformSuperAdmin: {},
  user: {},
}));

import { createAuth } from './auth';

const organizationManagementPaths = [
  '/organization/create',
  '/organization/update',
  '/organization/delete',
  // '/organization/set-active',
  '/organization/get-full-organization',
  '/organization/list',
  '/organization/invite-member',
  '/organization/cancel-invitation',
  '/organization/accept-invitation',
  '/organization/get-invitation',
  '/organization/reject-invitation',
  '/organization/list-invitations',
  '/organization/list-user-invitations',
  '/organization/get-active-member',
  '/organization/check-slug',
  '/organization/add-member',
  '/organization/remove-member',
  '/organization/update-member-role',
  '/organization/leave',
  '/organization/list-members',
  '/organization/get-active-member-role',
  '/organization/has-permission',
];

const adminManagementPaths = [
  '/admin/set-role',
  '/admin/get-user',
  '/admin/create-user',
  '/admin/update-user',
  '/admin/list-users',
  '/admin/list-user-sessions',
  '/admin/unban-user',
  '/admin/ban-user',
  '/admin/impersonate-user',
  '/admin/stop-impersonating',
  '/admin/revoke-user-session',
  '/admin/revoke-user-sessions',
  '/admin/remove-user',
  '/admin/set-user-password',
  '/admin/has-permission',
];

const phoneNumberPaths = [
  '/sign-in/phone-number',
  '/phone-number/send-otp',
  '/phone-number/verify',
  '/phone-number/request-password-reset',
  '/phone-number/reset-password',
];

describe('Better Auth management HTTP boundary', () => {
  const smsQueue = {
    addSendJob: jest.fn().mockResolvedValue(undefined),
  };

  const auth = createAuth({
    emailQueue: {
      addVerificationEmailJob: jest.fn(),
      addResetPasswordJob: jest.fn(),
    },
    smsQueue,
    redis: {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as never,
    database: {} as never,
    configuration: {
      secret: 'test-secret',
      baseURL: 'http://localhost/api/auth',
      googleClientId: '',
      googleClientSecret: '',
      githubClientId: '',
      githubClientSecret: '',
    },
  });

  it.each([
    ...organizationManagementPaths,
    ...adminManagementPaths,
    ...phoneNumberPaths,
  ])('configures %s as unavailable through HTTP', (path) => {
    expect(auth.options.disabledPaths).toContain(path);
  });

  it('keeps generic profile updates available through the internal API', () => {
    expect(auth.options.disabledPaths).not.toContain('/update-user');
  });

  it('retains the internal Organization API for Store adapters', () => {
    expect(auth.api.createOrganization).toEqual(expect.any(Function));
    expect(auth.api.updateOrganization).toEqual(expect.any(Function));
  });

  it('waits for phone-number verification SMS queue insertion', async () => {
    const phoneNumberOptions = mockPhoneNumber.mock.calls[0][0] as {
      expiresIn: number;
      allowedAttempts: number;
      phoneNumberValidator: (phoneNumber: string) => boolean;
      sendOTP: (input: { phoneNumber: string; code: string }) => Promise<void>;
      sendPasswordResetOTP: (input: {
        phoneNumber: string;
        code: string;
      }) => Promise<void>;
    };

    const result = phoneNumberOptions.sendOTP({
      phoneNumber: '+201234567890',
      code: '123456',
    });

    expect(smsQueue.addSendJob).toHaveBeenCalledWith(
      '+201234567890',
      'Your verification code is 123456. It expires in 5 minutes.',
    );
    await expect(result).resolves.toBeUndefined();
    expect(phoneNumberOptions.expiresIn).toBe(300);
    expect(phoneNumberOptions.allowedAttempts).toBe(5);
    expect(phoneNumberOptions.phoneNumberValidator('+201234567890')).toBe(true);
    expect(phoneNumberOptions.phoneNumberValidator(' +201234567890 ')).toBe(
      false,
    );
    expect(phoneNumberOptions.phoneNumberValidator('+20 123 456')).toBe(false);
  });

  it('waits for password-reset SMS queue insertion', async () => {
    const phoneNumberOptions = mockPhoneNumber.mock.calls[0][0] as {
      sendPasswordResetOTP: (input: {
        phoneNumber: string;
        code: string;
      }) => Promise<void>;
    };

    await expect(
      phoneNumberOptions.sendPasswordResetOTP({
        phoneNumber: '+201234567890',
        code: '123456',
      }),
    ).resolves.toBeUndefined();

    expect(smsQueue.addSendJob).toHaveBeenCalledWith(
      '+201234567890',
      'Your password reset code is 123456. It expires in 5 minutes.',
    );
  });

  it('does not publish a Better Auth HTTP rate-limit rule for OTP sends', () => {
    expect(auth.options.rateLimit).toMatchObject({
      storage: 'secondary-storage',
    });
    expect(auth.options.rateLimit.customRules).not.toHaveProperty(
      '/api/auth/phone-number/send-otp',
    );
  });
});
