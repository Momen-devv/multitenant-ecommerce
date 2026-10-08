import { endpointCacheHttp } from '@/infrastructure/cache/endpoint-cache-http';
import { ReadCacheService } from '@/infrastructure/cache/read-cache.service';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import {
  ForbiddenException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import basicAuth from 'express-basic-auth';
import { doubleCsrf } from 'csrf-csrf';
import { isProductionEnvironment } from './common/utils/environment.util';

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });

  const isProduction = isProductionEnvironment();
  const trustedOrigins = (
    process.env.TRUSTED_ORIGINS ?? new URL(process.env.BASE_URL!).origin
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // HTTP security headers. Avoid upgrading local HTTP URLs to HTTPS.
  app.use(
    helmet({
      strictTransportSecurity: isProduction ? undefined : false,
      contentSecurityPolicy: {
        directives: { upgradeInsecureRequests: isProduction ? [] : null },
      },
    }),
  );

  const express = app.getHttpAdapter().getInstance() as Express;
  express.set('query parser', 'extended');
  express.disable('etag');
  app.use(endpointCacheHttp(app.get(ReadCacheService)));

  app.enableCors({
    origin: trustedOrigins,
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'X-CSRF-Token',
      'Idempotency-Key',
      'X-Correlation-Id',
    ],
  });

  // Signed double-submit CSRF tokens, bound to the Better Auth session cookie.
  app.use(cookieParser());
  const sessionCookie = isProduction
    ? '__Secure-mte.session_token'
    : 'mte.session_token';
  const { generateCsrfToken, doubleCsrfProtection, invalidCsrfTokenError } =
    doubleCsrf({
      getSecret: () => process.env.BETTER_AUTH_SECRET!,
      getSessionIdentifier: (req) =>
        (req.cookies as Record<string, string>)[sessionCookie] ?? '',
      cookieName: isProduction ? '__Host-mte.csrf-token' : 'mte.csrf-token',
      cookieOptions: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
      },
      getCsrfTokenFromRequest: (req) => req.get('X-CSRF-Token'),
      // Auth has its own CSRF checks; webhooks authenticate Stripe signatures.
      skipCsrfProtection: (req) =>
        req.path === '/api/auth' ||
        req.path.startsWith('/api/auth/') ||
        ['/api/v1/webhooks/stripe', '/api/v1/webhooks/stripe-connect'].includes(
          req.path,
        ),
    });

  express.get('/api/csrf-token', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ csrfToken: generateCsrfToken(req, res) });
  });
  app.use(doubleCsrfProtection);
  app.use(
    (error: unknown, _req: Request, _res: Response, next: NextFunction) => {
      next(
        error === invalidCsrfTokenError
          ? new ForbiddenException('Invalid CSRF token')
          : error,
      );
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      stopAtFirstError: true,
    }),
  );

  app.enableShutdownHooks();

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Protect Swagger HTML, generated schemas, and UI assets before registering it.
  app.use(
    [
      /^\/api(?:-json|-yaml)?\/?$/i,
      /^\/api\/(?:api\/)?(?:swagger-ui[^/]*|favicon[^/]*|index\.html|LICENSE)\/?$/i,
    ],
    basicAuth({
      challenge: true,
      realm: 'API documentation',
      users: {
        [process.env.SWAGGER_USERNAME!]: process.env.SWAGGER_PASSWORD!,
      },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Multitenant E-commerce API')
    .setDescription(
      [
        'API documentation for the Multitenant E-commerce application.',
        '',
        '### Opening Swagger',
        'Use SWAGGER_USERNAME and SWAGGER_PASSWORD from your environment in the browser login prompt. These credentials grant access to documentation only.',
        '',
        '### Signing in to the API',
        '1. Create an account with POST /api/v1/auth/sign-up.',
        '2. Request a verification email with POST /api/v1/auth/send-verification-email and open the verification link.',
        '3. Sign in with POST /api/v1/auth/sign-in. The browser stores the HttpOnly session cookie automatically.',
        '4. Call GET /api/v1/auth/get-session to check your session. You can then try endpoints marked with a lock.',
        '5. Call POST /api/v1/auth/sign-out to end the current session.',
        '',
        'Swagger uses your browser cookies; sign in through the API instead of pasting a cookie into Authorize. API clients must preserve Set-Cookie responses and send the cookie on subsequent requests.',
        '',
        '### CSRF protection',
        'Swagger fetches a fresh CSRF token automatically before POST, PATCH, PUT, and DELETE requests. Other clients should call GET /api/csrf-token with their session cookie, preserve the CSRF cookie, and send the returned csrfToken in the X-CSRF-Token header. Fetch a new token after signing in or changing sessions.',
        '',
        '### Social sign-in',
        'POST /api/v1/auth/sign-in-social starts Google or GitHub sign-in. Open the returned provider URL in a browser; the provider returns to /api/auth/callback/:id. OAuth failures return JSON from /api/v1/auth/error.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addTag('Multitenant E-commerce')
    .addTag(
      'Authentication',
      'Email/password and social sign-in, verification, sessions, and linked accounts.',
    )
    .addCookieAuth(sessionCookie, {
      type: 'apiKey',
      in: 'cookie',
      name: sessionCookie,
    })
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory, {
    swaggerOptions: {
      withCredentials: true,
      // Fetch a session-bound token before Swagger sends an API write.
      requestInterceptor: async (request: {
        method: string;
        headers: Record<string, string>;
      }) => {
        if (
          !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())
        ) {
          const response = await fetch('/api/csrf-token', {
            credentials: 'include',
          });
          const { csrfToken } = (await response.json()) as {
            csrfToken: string;
          };
          request.headers['X-CSRF-Token'] = csrfToken;
        }
        return request;
      },
    },
  });

  app.useLogger(app.get(LoggerService));
  await app.listen(process.env.PORT ?? 3000);
  process.send?.('ready');
}
bootstrap().catch((error) => {
  const logger = new LoggerService();
  logger.error('Failed to bootstrap the application', error);
  process.exit(1);
});
