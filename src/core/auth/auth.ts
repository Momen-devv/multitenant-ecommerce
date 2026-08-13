import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization, admin, openAPI } from 'better-auth/plugins';
import * as schema from '@/infrastructure/database/schema/schema';
import type { Redis } from 'ioredis';
import { generateUUIDv7, hashPassword, verifyPassword } from '@/common/utils';
import * as Schema from '@/infrastructure/database/schema/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ConfigType } from '@nestjs/config';
import { betterAuthConfig } from '../config';
import { isProduction } from 'better-auth';
import { ac, user, superAdmin } from './permissions';

const DISABLED_BETTER_AUTH_MANAGEMENT_PATHS = [
  '/organization/create',
  '/organization/update',
  '/organization/delete',
  '/organization/set-active',
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
] as const;

type AuthEmailQueue = {
  addVerificationEmailJob: (
    to: string,
    url: string,
    token: string,
  ) => Promise<void>;
  addResetPasswordJob: (to: string, url: string) => Promise<void>;
};

type AuthDependencies = {
  emailQueue: AuthEmailQueue;
  redis: Redis;
  database: NodePgDatabase<typeof Schema>;
  configuration: ConfigType<typeof betterAuthConfig>;
};

export function createAuth({
  emailQueue,
  redis,
  database,
  configuration,
}: AuthDependencies) {
  const db = database;

  const authOptions = {
    secret: configuration.secret,
    baseURL: configuration.baseURL,

    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
    }),

    socialProviders: {
      google: {
        clientId: configuration.googleClientId,
        clientSecret: configuration.googleClientSecret,
      },
      github: {
        clientId: configuration.githubClientId,
        clientSecret: configuration.githubClientSecret,
      },
    },

    disabledPaths: ['/update-user', ...DISABLED_BETTER_AUTH_MANAGEMENT_PATHS],

    user: {
      changeEmail: {
        enabled: true,
      },
      additionalFields: {
        imageKey: {
          type: 'string',
          required: false,
          input: true,
          defaultValue: null,
        },
        isActive: {
          type: 'boolean',
          required: false,
          input: true,
          defaultValue: true,
        },
        deactivatedAt: {
          type: 'date',
          required: false,
          input: true,
          defaultValue: null,
        },
      },
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      password: {
        hash: (password: string) => hashPassword(password),
        verify: ({ hash, password }: { hash: string; password: string }) =>
          verifyPassword(hash, password),
      },
      sendResetPassword: ({ user, url }) => {
        return emailQueue.addResetPasswordJob(user.email, url);
      },
    },

    emailVerification: {
      sendVerificationEmail: ({ user, url, token }) => {
        return emailQueue.addVerificationEmailJob(user.email, url, token);
      },
    },

    secondaryStorage: {
      get: async (key) => redis.get(key),
      set: async (key, value, ttl) => {
        if (ttl) {
          await redis.set(key, value, 'EX', ttl);
        } else {
          await redis.set(key, value);
        }
      },
      delete: async (key) => {
        await redis.del(key);
      },
    },

    session: {
      storeSessionInDatabase: false,
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },

    rateLimit: {
      enabled: true,
      window: isProduction ? 10 : 60,
      max: isProduction ? 100 : 500,
      storage: 'secondary-storage',
      customRules: {
        '/api/auth/sign-in/email': { window: 60, max: 5 },
        '/api/auth/sign-up/email': { window: 60, max: 3 },
        '/api/auth/request-password-reset': { window: 300, max: 3 },
        '/api/auth/change-password': { window: 300, max: 3 },
      },
    },

    advanced: {
      cookiePrefix: 'mte',
      cookies: {
        session_token: {
          attributes: {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
          },
        },
      },
      database: {
        generateId: () => generateUUIDv7(),
      },
      useSecureCookies: isProduction,
      disableCSRFCheck: false,
      ipAddress: {
        ipAddressHeaders: ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip'],
        disableIpTracking: false,
      },
    },

    plugins: [
      organization({
        allowUserToCreateOrganization: (user) => user.emailVerified === true,
        organizationLimit: 1,
        membershipLimit: 100,
        invitationExpiresIn: 60 * 60 * 24 * 7,
        invitationLimit: 100,
        cancelPendingInvitationsOnReInvite: true,
      }),
      admin({
        ac,
        roles: { superAdmin, user },
        defaultRole: 'user',
        impersonationSessionDuration: 60 * 15,
        defaultBanReason: 'Violation of platform terms',
        defaultBanExpiresIn: undefined,
        bannedUserMessage:
          'Your account has been banned due to violation of platform terms. Please contact support for more information.',
      }),
      openAPI(),
    ],
    hooks: {},
    databaseHooks: {},
  } satisfies BetterAuthOptions;

  return betterAuth<typeof authOptions>(authOptions);
}

export type Auth = ReturnType<typeof createAuth>;
