import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
} from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request, Response } from 'express';
import { SkipResponseTransform } from '@/common/decorators';
import { SessionQueryDto, UpdateSessionDto, RevokeSessionDto } from '../dto';
import { SessionService } from '../services/session.service';
import { sendAuthResponse } from '../http/send-auth-response';

@ApiTags('Authentication')
@Controller('auth')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get('get-session')
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Get the current session',
    description:
      'Return the current user and session, or null when no valid session exists. This endpoint can be called without signing in.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @AllowAnonymous()
  async getSession(
    @Query() query: SessionQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.sessionService.getSession(query, request.headers),
    );
  }

  @Post('update-session')
  @ApiCookieAuth()
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Update additional session fields',
    description:
      'No writable additional session fields are currently configured; Better Auth rejects empty updates.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @ApiBody({ schema: { type: 'object', additionalProperties: false } })
  async updateSession(
    @Body() body: UpdateSessionDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.sessionService.updateSession(body, request.headers),
    );
  }

  @Get('list-sessions')
  @ApiCookieAuth()
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'List active sessions',
    description: 'List active sessions belonging to the signed-in user.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  async listSessions(@Req() request: Request, @Res() response: Response) {
    await sendAuthResponse(
      response,
      await this.sessionService.listSessions(request.headers),
    );
  }

  @Post('revoke-session')
  @ApiCookieAuth()
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Revoke a specific session',
    description:
      'Invalidate one of your sessions using its token from list-sessions.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  async revokeSession(
    @Body() body: RevokeSessionDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.sessionService.revokeSession(body, request.headers),
    );
  }

  @Post('revoke-other-sessions')
  @ApiCookieAuth()
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Sign out all other sessions',
    description:
      'Invalidate your other sessions while keeping the current session active.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  async revokeOtherSessions(
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.sessionService.revokeOtherSessions(request.headers),
    );
  }
}
