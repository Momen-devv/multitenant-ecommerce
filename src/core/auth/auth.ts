import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization, admin } from 'better-auth/plugins';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@/infrastructure/database/schema/schema';
import { Redis } from 'ioredis';
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

const redis = new Redis(process.env.REDIS_URL!);

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url, token }, request) => {
      console.log('🚀 Attempting to send email to:', user.email);
      try {
        const res = await resend.emails.send({
          from: 'onboarding@resend.dev', // Replace with verified domain in production
          to: user.email,
          subject: 'Verify your email',
          html: `<a href="${url}">Click here to verify your email</a>`,
        });
        console.log('✅ Resend Response:', res);
      } catch (err) {
        console.error('❌ Verification email failed:', err);
        throw err; // Important: let Better Auth know it failed
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
    },
  },

  rateLimit: {
    enabled: true,
    window: 10,
    max: 100,
    storage: 'secondary-storage',
  },

  plugins: [organization(), admin()],

  databaseHooks: {},
});
