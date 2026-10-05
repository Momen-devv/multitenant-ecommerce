import { Injectable } from '@nestjs/common';
import { AuthService as BetterAuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import type { Auth } from '@/modules/auth/config/auth';
import type * as Dto from '../dto';

@Injectable()
export class EmailService {
  constructor(private readonly betterAuth: BetterAuthService<Auth>) {}

  verifyEmail(query: Dto.VerifyEmailDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.verifyEmail({
      query: { ...query },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  sendVerificationEmail(
    body: Dto.SendVerificationEmailDto,
    headers: IncomingHttpHeaders,
  ) {
    return this.betterAuth.api.sendVerificationEmail({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  changeEmail(body: Dto.ChangeEmailDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.changeEmail({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }
}
