import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization, admin, openAPI } from 'better-auth/plugins';
import * as schema from '@/infrastructure/database/schema/schema';
import type { Redis } from 'ioredis';
import { Environment } from '@/common/enums';
import { generateUUIDv7, hashPassword, verifyPassword } from '@/common/utils';
import * as Schema from '@/infrastructure/database/schema/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

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
};

// function parseTrustedOrigins(): string[] {
//   const baseUrlOrigin = process.env.BETTER_AUTH_URL
//     ? new URL(process.env.BETTER_AUTH_URL).origin
//     : undefined;

//   const configuredOrigins =
//     process.env.TRUSTED_ORIGINS?.split(',')
//       .map((origin) => origin.trim())
//       .filter(Boolean) ?? [];

//   return Array.from(
//     new Set([...(baseUrlOrigin ? [baseUrlOrigin] : []), ...configuredOrigins]),
//   );
// }
export function createAuth({ emailQueue, redis, database }: AuthDependencies) {
  const isProduction = process.env.NODE_ENV === Environment.Production;

  const db = database;

  const authOptions = {
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,

    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
    }),

    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      },
    },

    disabledPaths: ['/update-user'],

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
        organizationLimit: 10,
        membershipLimit: 100,
        invitationExpiresIn: 60 * 60 * 24 * 7,
        invitationLimit: 100,
        cancelPendingInvitationsOnReInvite: true,
      }),
      admin(),
      openAPI(),
    ],
    hooks: {},
    databaseHooks: {},
  } satisfies BetterAuthOptions;

  return betterAuth<typeof authOptions>(authOptions);
}

export type Auth = ReturnType<typeof createAuth>;
