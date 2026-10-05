import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { SkipResponseTransform } from '@/common/decorators';
import {
  AccountInfoDto,
  LinkSocialDto,
  UnlinkAccountDto,
  ProviderTokenDto,
} from '../dto';
import { AccountService } from '../services/account.service';
import { sendAuthResponse } from '../http/send-auth-response';

@ApiTags('Authentication')
@Controller('auth')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('account-info')
  @ApiCookieAuth()
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Get linked account information',
    description:
      'Retrieve provider account information for the signed-in user.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  async accountInfo(
    @Query() query: AccountInfoDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.accountService.accountInfo(query, request.headers),
    );
  }

  @Get('list-accounts')
  @ApiCookieAuth()
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'List linked accounts',
    description: 'List authentication accounts linked to the signed-in user.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  async listUserAccounts(@Req() request: Request, @Res() response: Response) {
    await sendAuthResponse(
      response,
      await this.accountService.listUserAccounts(request.headers),
    );
  }

  @Post('link-social')
  @ApiCookieAuth()
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Link a social account',
    description:
      'Start linking a Google or GitHub account to the signed-in user. Complete the returned OAuth flow in a browser.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  async linkSocialAccount(
    @Body() body: LinkSocialDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.accountService.linkSocialAccount(body, request.headers),
    );
  }

  @Post('unlink-account')
  @ApiCookieAuth()
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Unlink an authentication account',
    description:
      'Remove a linked provider account from the signed-in user, subject to account-linking restrictions.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  async unlinkAccount(
    @Body() body: UnlinkAccountDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.accountService.unlinkAccount(body, request.headers),
    );
  }

  @Post('refresh-token')
  @ApiCookieAuth()
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Refresh a provider token',
    description:
      'Refresh the OAuth token for a provider account belonging to the signed-in user. This does not refresh the application session.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  async refreshToken(
    @Body() body: ProviderTokenDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.accountService.refreshToken(body, request.headers),
    );
  }

  @Post('get-access-token')
  @ApiCookieAuth()
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Get a provider access token',
    description:
      'Retrieve an OAuth access token for a linked provider account belonging to the signed-in user.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  async getAccessToken(
    @Body() body: ProviderTokenDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.accountService.getAccessToken(body, request.headers),
    );
  }
}
