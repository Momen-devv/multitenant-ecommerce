import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { seconds, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { SkipResponseTransform } from '@/common/decorators';
import {
  ResetPasswordDto,
  VerifyPasswordDto,
  RequestPasswordResetDto,
  ChangePasswordDto,
} from '../dto';
import { PasswordService } from '../services/password.service';
import { sendAuthResponse } from '../http/send-auth-response';

@ApiTags('Authentication')
@Controller('auth')
export class PasswordController {
  constructor(private readonly passwordService: PasswordService) {}

  @Post('reset-password')
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Reset a password using an email token',
    description:
      'Submit the reset token and new password received through the password-reset email flow.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @AllowAnonymous()
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  async resetPassword(
    @Body() body: ResetPasswordDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.passwordService.resetPassword(body, request.headers),
    );
  }

  @Post('verify-password')
  @ApiCookieAuth()
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Verify the current password',
    description:
      'Check the password of the signed-in user without changing it.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  async verifyPassword(
    @Body() body: VerifyPasswordDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.passwordService.verifyPassword(body, request.headers),
    );
  }

  @Post('request-password-reset')
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Request a password-reset email',
    description:
      'Request a reset link for the supplied email. Use the email flow to obtain a token, then call reset-password.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @AllowAnonymous()
  @Throttle({ default: { limit: 3, ttl: seconds(300) } })
  async requestPasswordReset(
    @Body() body: RequestPasswordResetDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.passwordService.requestPasswordReset(body, request.headers),
    );
  }

  @Post('forget-password')
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Request a password-reset email (alias)',
    description: 'Alias of request-password-reset.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @AllowAnonymous()
  @Throttle({ default: { limit: 3, ttl: seconds(300) } })
  async forgetPassword(
    @Body() body: RequestPasswordResetDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.passwordService.forgetPassword(body, request.headers),
    );
  }

  @Post('change-password')
  @ApiCookieAuth()
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Change the current password',
    description:
      'Provide the current and new passwords. Set revokeOtherSessions to true to sign out other sessions.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @Throttle({ default: { limit: 3, ttl: seconds(300) } })
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.passwordService.changePassword(body, request.headers),
    );
  }
}
