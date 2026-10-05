import { createUserNotificationHooks } from '../hooks/user-notifications.hook';
import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization, admin, openAPI, phoneNumber } from 'better-auth/plugins';
import * as schema from '@/infrastructure/database/schema/schema';
import type { Redis } from 'ioredis';
import {
  generateUUIDv7,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from '@/common/utils';
import { AuthRole, OrganizationRole } from '@/common/enums';
import * as Schema from '@/infrastructure/database/schema/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ConfigType } from '@nestjs/config';
import { betterAuthConfig } from '@/core/config';
import { isProduction } from 'better-auth';
import { atomicInvitationEndpoints } from '../hooks/atomic-invitation-endpoints';
import {
  ac,
  organizationManager,
  organizationOwner,
  platformSuperAdmin,
  support,
  user,
} from '../permissions/permissions';

// These HTTP routes are exposed through the Nest authentication module instead.
const DISABLED_BETTER_AUTH_AUTHENTICATION_PATHS = [
  '/sign-in/social',
  '/sign-up/email',
  '/sign-in/email',
  '/reset-password',
  '/verify-password',
  '/request-password-reset',
  '/sign-out',
  '/forget-password',
  '/verify-email',
  '/send-verification-email',
  '/get-session',
  '/account-info',
  '/change-email',
  '/change-password',
  '/update-session',
  '/list-sessions',
  '/revoke-session',
  '/revoke-other-sessions',
  '/list-accounts',
  '/link-social',
  '/unlink-account',
  '/refresh-token',
  '/get-access-token',
  '/ok',
  '/error',
] as const;

const DISABLED_BETTER_AUTH_MANAGEMENT_PATHS = [
  '/update-user',
  '/delete-user',
  '/delete-user/callback',
  '/revoke-sessions',
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

const DISABLED_BETTER_AUTH_PHONE_PATHS = [
  '/sign-in/phone-number',
  '/phone-number/send-otp',
  '/phone-number/verify',
  '/phone-number/request-password-reset',
  '/phone-number/reset-password',
] as const;

type AuthEmailQueue = {
  addVerificationEmailJob: (
    to: string,
    url: string,
    token: string,
  ) => Promise<void>;
  addResetPasswordJob: (to: string, url: string) => Promise<void>;
  addInvitationEmailJob: (
    to: string,
    organizationName: string,
    inviterName: string,
    role: string,
    inviteLink: string,
    rejectLink: string,
  ) => Promise<void>;
};

type AuthSmsQueue = {
  addSendJob: (to: string, body: string) => Promise<void>;
};

type AuthDependencies = {
  emailQueue: AuthEmailQueue;
  smsQueue: AuthSmsQueue;
  redis: Redis;
  database: NodePgDatabase<typeof Schema>;
  configuration: ConfigType<typeof betterAuthConfig>;
};

export function createAuth({
  emailQueue,
  smsQueue,
  redis,
  database,
  configuration,
}: AuthDependencies) {
  const db = database;

  const authOptions = {
    secret: configuration.secret,
    baseURL: configuration.baseURL,
    onAPIError: {
      errorURL: configuration.errorURL,
    },

    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
      transaction: true,
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

    disabledPaths: [
      ...DISABLED_BETTER_AUTH_AUTHENTICATION_PATHS,
      ...DISABLED_BETTER_AUTH_MANAGEMENT_PATHS,
      ...DISABLED_BETTER_AUTH_PHONE_PATHS,
    ],

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
        const verificationUrl = new URL(url);
        verificationUrl.pathname = '/api/v1/auth/verify-email';
        return emailQueue.addVerificationEmailJob(
          user.email,
          verificationUrl.toString(),
          token,
        );
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
        // Hash identifiers so pub/sub never exposes session credentials.
        void redis
          .publish('notifications:session.revoked', sha256Hex(key))
          .catch(() => undefined);
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
      atomicInvitationEndpoints(
        organization({
          ac,
          roles: {
            [OrganizationRole.OWNER]: organizationOwner,
            [OrganizationRole.MANAGER]: organizationManager,
            [OrganizationRole.SUPPORT]: support,
          },
          allowUserToCreateOrganization: (user) => user.emailVerified === true,
          organizationLimit: 1,
          membershipLimit: 100,
          invitationExpiresIn: 60 * 60 * 24 * 7,
          invitationLimit: 100,
          cancelPendingInvitationsOnReInvite: true,
          requireEmailVerificationOnInvitation: true,
          // The database trigger captures delivery inside the invitation transaction.
          // Startup verifies the trigger; polling owns email delivery and recovery.
          sendInvitationEmail: () => Promise.resolve(),
        }),
      ),
      admin({
        ac,
        roles: {
          [AuthRole.PLATFORM_SUPER_ADMIN]: platformSuperAdmin,
          [AuthRole.USER]: user,
        },
        defaultRole: AuthRole.USER,
        impersonationSessionDuration: 60 * 15,
        defaultBanReason: 'Violation of platform terms',
        defaultBanExpiresIn: undefined,
        bannedUserMessage:
          'Your account has been banned due to violation of platform terms. Please contact support for more information.',
      }),
      openAPI(),
      phoneNumber({
        expiresIn: 300,
        allowedAttempts: 5,
        phoneNumberValidator: (phoneNumber: string) =>
          /^\+[1-9]\d{1,14}$/.test(phoneNumber),
        sendOTP: ({ phoneNumber, code }) =>
          smsQueue.addSendJob(
            phoneNumber,
            `Your verification code is ${code}. It expires in 5 minutes.`,
          ),
        sendPasswordResetOTP: ({ phoneNumber, code }) =>
          smsQueue.addSendJob(
            phoneNumber,
            `Your password reset code is ${code}. It expires in 5 minutes.`,
          ),
      }),
    ],
    hooks: {},
    databaseHooks: createUserNotificationHooks(db),
  } satisfies BetterAuthOptions;

  return betterAuth<typeof authOptions>(authOptions);
}

export type Auth = ReturnType<typeof createAuth>;
