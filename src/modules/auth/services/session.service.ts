import { Injectable } from '@nestjs/common';
import { AuthService as BetterAuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import type { Auth } from '@/modules/auth/config/auth';
import type * as Dto from '../dto';

@Injectable()
export class SessionService {
  constructor(private readonly betterAuth: BetterAuthService<Auth>) {}

  getSession(query: Dto.SessionQueryDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.getSession({
      query: { ...query },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  updateSession(body: Dto.UpdateSessionDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.updateSession({
      body: {},
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  listSessions(headers: IncomingHttpHeaders) {
    return this.betterAuth.api.listSessions({
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  revokeSession(body: Dto.RevokeSessionDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.revokeSession({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  revokeOtherSessions(headers: IncomingHttpHeaders) {
    return this.betterAuth.api.revokeOtherSessions({
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }
}
