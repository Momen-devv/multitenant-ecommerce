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
jest.mock('better-auth/plugins', () => ({
  admin: jest.fn(() => ({ id: 'admin' })),
  openAPI: jest.fn(() => ({ id: 'open-api' })),
  organization: jest.fn(() => ({ id: 'organization' })),
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

describe('Better Auth management HTTP boundary', () => {
  const auth = createAuth({
    emailQueue: {
      addVerificationEmailJob: jest.fn(),
      addResetPasswordJob: jest.fn(),
    },
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

  it.each([...organizationManagementPaths, ...adminManagementPaths])(
    'configures %s as unavailable through HTTP',
    (path) => {
      expect(auth.options.disabledPaths).toContain(path);
    },
  );

  it('retains the internal Organization API for Store adapters', () => {
    expect(auth.api.createOrganization).toEqual(expect.any(Function));
    expect(auth.api.updateOrganization).toEqual(expect.any(Function));
  });
});
