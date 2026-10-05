import { Injectable } from '@nestjs/common';
import { AuthService as BetterAuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import type { Auth } from '@/modules/auth/config/auth';
import type * as Dto from '../dto';

@Injectable()
export class PasswordService {
  constructor(private readonly betterAuth: BetterAuthService<Auth>) {}

  resetPassword(body: Dto.ResetPasswordDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.resetPassword({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  verifyPassword(body: Dto.VerifyPasswordDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.verifyPassword({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  requestPasswordReset(
    body: Dto.RequestPasswordResetDto,
    headers: IncomingHttpHeaders,
  ) {
    return this.betterAuth.api.requestPasswordReset({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  forgetPassword(
    body: Dto.RequestPasswordResetDto,
    headers: IncomingHttpHeaders,
  ) {
    return this.betterAuth.api.requestPasswordReset({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  changePassword(body: Dto.ChangePasswordDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.changePassword({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }
}
