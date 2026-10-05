// // just a temporary file to make sure that the auth module is initialized correctly and all environment variables are set up properly. This file is not meant to be used in production and should be removed before deploying the application.
// /* eslint-disable @typescript-eslint/require-await */
// import 'dotenv/config';
// import { Pool } from 'pg';
// import { drizzle } from 'drizzle-orm/node-postgres';
// import * as schema from '@/infrastructure/database/schema/schema';
// import { createAuth } from './auth';

// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
// });

// const database = drizzle(pool, { schema });

// export const auth = createAuth({
//   database,

//   // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
//   redis: {
//     get: async () => null,
//     set: async () => 'OK',
//     del: async () => 1,
//   } as any,

//   emailQueue: {
//     addVerificationEmailJob: async () => {},
//     addResetPasswordJob: async () => {},
//     addInvitationEmailJob: async () => {},
//   },

//   // smsQueue: {
//   //   addSendJob: async () => {},
//   // },

//   configuration: {
//     secret: process.env.BETTER_AUTH_SECRET!,
//     baseURL: process.env.BETTER_AUTH_URL!,
//     googleClientId: process.env.GOOGLE_CLIENT_ID ?? 'placeholder',
//     googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? 'placeholder',
//     githubClientId: process.env.GITHUB_CLIENT_ID ?? 'placeholder',
//     githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? 'placeholder',
//   },
// });
