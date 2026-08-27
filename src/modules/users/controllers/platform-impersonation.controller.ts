import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  Session,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiErrorResponse, ApiSuccessResponse } from '@/common/decorators';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { PlatformImpersonationService } from '../services/platform-impersonation.service';
import type { CurrentUser } from '@/core/auth/auth.types';
import { Roles } from '@thallesp/nestjs-better-auth';
import { AuthRole } from '@/common/enums';
import { PlatformUserReasonDto } from '../dto';

@ApiTags('Platform Impersonation')
@ApiCookieAuth()
@Controller('platform/impersonation')
export class PlatformImpersonationController {
  constructor(
    private readonly platformImpersonationService: PlatformImpersonationService,
  ) {}

  @ApiOperation({ summary: 'Begin a short-lived user impersonation session' })
  @ApiSuccessResponse({ description: 'Impersonation started successfully' })
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Platform super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ResponseMessage('Impersonation started successfully')
  @Roles([AuthRole.PLATFORM_SUPER_ADMIN])
  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  @Post(':userId')
  async impersonateUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: PlatformUserReasonDto,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.platformImpersonationService.startImpersonation(
      userId,
      dto.reason,
      session.user.id,
      headers,
    );
    this.forwardCookies(response, result.headers);
    return result.data;
  }

  @ApiOperation({ summary: 'Stop the current impersonation session' })
  @ApiSuccessResponse({ description: 'Impersonation stopped successfully' })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'No impersonation is active')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ResponseMessage('Impersonation stopped successfully')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Delete('current')
  async stopImpersonating(
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.platformImpersonationService.stopImpersonation(
      session.user.id,
      headers,
    );
    this.forwardCookies(response, result.headers);
    return result.data;
  }

  private forwardCookies(response: Response, headers: Headers): void {
    const extended = headers as Headers & { getSetCookie?: () => string[] };
    const cookies = extended.getSetCookie?.();
    if (cookies?.length) {
      response.append('Set-Cookie', cookies);
      return;
    }

    const cookie = headers.get('set-cookie');
    if (cookie) response.append('Set-Cookie', cookie);
  }
}
