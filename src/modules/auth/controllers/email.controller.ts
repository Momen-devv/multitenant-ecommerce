import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
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
  VerifyEmailDto,
  SendVerificationEmailDto,
  ChangeEmailDto,
} from '../dto';
import { EmailService } from '../services/email.service';
import { sendAuthResponse } from '../http/send-auth-response';

@ApiTags('Authentication')
@Controller('auth')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Get('verify-email')
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Verify an email address',
    description:
      'Open the link delivered by the verification email. Supply its token; callbackURL optionally redirects after verification.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @AllowAnonymous()
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  async verifyEmail(
    @Query() query: VerifyEmailDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.emailService.verifyEmail(query, request.headers),
    );
  }

  @Post('send-verification-email')
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Request an email-verification link',
    description:
      'Send a verification link to the supplied email address. Open that link before signing in with email and password.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @AllowAnonymous()
  @Throttle({ default: { limit: 3, ttl: seconds(300) } })
  async sendVerificationEmail(
    @Body() body: SendVerificationEmailDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.emailService.sendVerificationEmail(body, request.headers),
    );
  }

  @Post('change-email')
  @ApiCookieAuth()
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Request an email change',
    description:
      'Request a new email address for the signed-in user. Complete the verification email flow to confirm the change.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @Throttle({ default: { limit: 3, ttl: seconds(300) } })
  async changeEmail(
    @Body() body: ChangeEmailDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.emailService.changeEmail(body, request.headers),
    );
  }
}
