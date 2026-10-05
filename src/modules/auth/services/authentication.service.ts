import { Injectable } from '@nestjs/common';
import { AuthService as BetterAuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import type { Auth } from '@/modules/auth/config/auth';
import type * as Dto from '../dto';

@Injectable()
export class AuthenticationService {
  constructor(private readonly betterAuth: BetterAuthService<Auth>) {}

  signInSocial(body: Dto.SocialSignInDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.signInSocial({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  signUpEmail(body: Dto.SignUpDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.signUpEmail({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  signInEmail(body: Dto.SignInDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.signInEmail({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  signOut(headers: IncomingHttpHeaders) {
    return this.betterAuth.api.signOut({
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  ok(headers: IncomingHttpHeaders) {
    return this.betterAuth.api.ok({
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  error(query: Dto.AuthErrorDto) {
    return Response.json({
      code: query.error ?? 'UNKNOWN',
      message: query.error_description ?? 'Authentication failed.',
    });
  }
}
