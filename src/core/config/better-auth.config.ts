import { registerAs } from '@nestjs/config';

export default registerAs('better-auth', () => ({
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  errorURL:
    process.env.AUTH_ERROR_URL ??
    new URL('/api/v1/auth/error', process.env.BETTER_AUTH_URL).toString(),

  googleClientId: process.env.GOOGLE_CLIENT_ID!,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  githubClientId: process.env.GITHUB_CLIENT_ID!,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET!,
}));
