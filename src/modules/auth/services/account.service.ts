import { Injectable } from '@nestjs/common';
import { AuthService as BetterAuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import type { Auth } from '@/modules/auth/config/auth';
import type * as Dto from '../dto';

@Injectable()
export class AccountService {
  constructor(private readonly betterAuth: BetterAuthService<Auth>) {}

  accountInfo(query: Dto.AccountInfoDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.accountInfo({
      query: { ...query },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  listUserAccounts(headers: IncomingHttpHeaders) {
    return this.betterAuth.api.listUserAccounts({
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  linkSocialAccount(body: Dto.LinkSocialDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.linkSocialAccount({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  unlinkAccount(body: Dto.UnlinkAccountDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.unlinkAccount({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  refreshToken(body: Dto.ProviderTokenDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.refreshToken({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }

  getAccessToken(body: Dto.ProviderTokenDto, headers: IncomingHttpHeaders) {
    return this.betterAuth.api.getAccessToken({
      body: { ...body },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
  }
}
