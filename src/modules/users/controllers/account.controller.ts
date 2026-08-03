import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Session,
  Res,
} from '@nestjs/common';
import { AccountService } from '../services/account.service';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { CurrentUser } from '@/core/auth/auth.types';
import { ConfirmReactivationDto, RequestReactivationDto } from '../dto';
import { seconds, Throttle } from '@nestjs/throttler';
import { isProduction } from 'better-auth';
import type { Response } from 'express';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiSuccessResponse, ApiErrorResponse } from '@/common/decorators';

@ApiTags('Account')
@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @ApiOperation({
    summary: 'Deactivate the current user account',
    description:
      'Deactivates the account of the currently authenticated user. This action will log the user out and clear their session cookie.',
  })
  @ApiCookieAuth()
  @ApiSuccessResponse({ description: 'Account deactivated successfully' })
  @ApiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    'Unauthorized. The user must be authenticated to deactivate their account.',
  )
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Bad request. The account could not be deactivated.',
  )
  @ApiErrorResponse(
    HttpStatus.TOO_MANY_REQUESTS,
    'Too many requests. Rate limit exceeded (3 requests / 60s).',
  )
  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  @ResponseMessage('Account deactivated successfully')
  @HttpCode(HttpStatus.OK)
  @Post('deactivate')
  async deactivateAccount(
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.accountService.deactivateAccount(
      session.user.id,
      session.user.email,
      headers,
    );

    res.clearCookie('mte.session_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
    });
  }

  @ApiOperation({
    summary: 'Request account reactivation',
    description:
      'Sends a reactivation link to the provided email if the associated account exists and is currently deactivated. Always returns the same generic message regardless of whether the account exists, to avoid account enumeration.',
  })
  @ApiSuccessResponse({
    description:
      'Reactivation request processed (generic response regardless of account existence)',
  })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Validation failed. The provided email is not a valid email address.',
  )
  @ApiErrorResponse(
    HttpStatus.TOO_MANY_REQUESTS,
    'Too many requests. Rate limit exceeded (3 requests / 5min).',
  )
  @Throttle({ default: { limit: 3, ttl: seconds(300) } })
  @AllowAnonymous()
  @ResponseMessage(
    'If an account with this email exists and is deactivated, a reactivation link has been sent.',
  )
  @HttpCode(HttpStatus.OK)
  @Post('reactivate/request')
  async requestReactivation(@Body() dto: RequestReactivationDto) {
    await this.accountService.requestReactivation(dto.email);
  }

  @ApiOperation({
    summary: 'Confirm account reactivation',
    description:
      'Confirms and completes account reactivation using the token sent to the user email.',
  })
  @ApiSuccessResponse({ description: 'Account reactivated successfully' })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Invalid request. Either the query parameters (token, userId) failed validation, or the reactivation token is invalid/expired.',
  )
  @ApiErrorResponse(
    HttpStatus.TOO_MANY_REQUESTS,
    'Too many requests. Rate limit exceeded (5 requests / 60s).',
  )
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @AllowAnonymous()
  @ResponseMessage('Account reactivated successfully')
  @HttpCode(HttpStatus.OK)
  @Get('reactivate/confirm')
  async confirmReactivation(@Query() dto: ConfirmReactivationDto) {
    await this.accountService.confirmReactivation(dto.token, dto.userId);
  }
}
