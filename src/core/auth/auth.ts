import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization, admin } from 'better-auth/plugins';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import { Redis } from 'ioredis';
import { Environment } from '@/common/enums';

type AuthLogger = {
  log: (message: string, context?: string) => void;
  warn: (message: string, context?: string) => void;
  error: (message: string, trace?: string, context?: string) => void;
};

type AuthEmailQueue = {
  addVerificationEmailJob: (
    to: string,
    url: string,
    token: string,
  ) => Promise<void>;
  addResetPasswordJob: (to: string, url: string) => Promise<void>;
};

type AuthDependencies = {
  logger: AuthLogger;
  emailQueue: AuthEmailQueue;
};

function parseTrustedOrigins(): string[] {
  const baseUrlOrigin = process.env.BETTER_AUTH_URL
    ? new URL(process.env.BETTER_AUTH_URL).origin
    : undefined;

  const configuredOrigins =
    process.env.TRUSTED_ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  return Array.from(
    new Set([...(baseUrlOrigin ? [baseUrlOrigin] : []), ...configuredOrigins]),
  );
}

export function createAuth({ logger, emailQueue }: AuthDependencies) {
  const isProduction = process.env.NODE_ENV === Environment.Production;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool, { schema });
  const redis = new Redis(process.env.REDIS_URL!);

  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,

    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
    }),

    trustedOrigins: parseTrustedOrigins(),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        try {
          await emailQueue.addResetPasswordJob(user.email, url);
          logger.log(
            `Queued reset password email for ${user.email}`,
            'BetterAuth',
          );
        } catch (error) {
          logger.error(
            `Failed to queue reset password email for ${user.email}`,
            error instanceof Error ? error.stack : undefined,
            'BetterAuth',
          );
          throw error;
        }
      },
    },

    emailVerification: {
      sendVerificationEmail: async ({ user, url, token }) => {
        try {
          await emailQueue.addVerificationEmailJob(user.email, url, token);
          logger.log(
            `Queued verification email for ${user.email}`,
            'BetterAuth',
          );
        } catch (error) {
          logger.error(
            `Failed to queue verification email for ${user.email}`,
            error instanceof Error ? error.stack : undefined,
            'BetterAuth',
          );
          throw error;
        }
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
        return null;
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
        strategy: 'compact',
      },
    },

    rateLimit: {
      enabled: true,
      window: isProduction ? 10 : 60,
      max: isProduction ? 100 : 500,
      storage: 'secondary-storage',
      customRules: isProduction
        ? {
            '/api/auth/sign-in/email': { window: 60, max: 5 },
            '/api/auth/sign-up/email': { window: 60, max: 3 },
            '/api/auth/request-password-reset': { window: 300, max: 3 },
            '/api/auth/change-password': { window: 300, max: 3 },
          }
        : {},
    },

    advanced: {
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
    ],

    databaseHooks: {},
  });
}
