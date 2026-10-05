import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { seconds, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { SkipResponseTransform } from '@/common/decorators';
import { SocialSignInDto, SignUpDto, SignInDto, AuthErrorDto } from '../dto';
import { AuthenticationService } from '../services/authentication.service';
import { sendAuthResponse } from '../http/send-auth-response';

@ApiTags('Authentication')
@Controller('auth')
export class AuthenticationController {
  constructor(private readonly authenticationService: AuthenticationService) {}

  @Post('sign-in-social')
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Start social sign-in',
    description:
      'Start Google or GitHub authentication. Open the returned provider URL in a browser to complete sign-in.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @AllowAnonymous()
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  async signInSocial(
    @Body() body: SocialSignInDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.authenticationService.signInSocial(body, request.headers),
    );
  }

  @Post('sign-up')
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Create an account',
    description:
      'Register using a name, email, and password. Email verification is required before email/password sign-in.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @AllowAnonymous()
  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  async signUpEmail(
    @Body() body: SignUpDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.authenticationService.signUpEmail(body, request.headers),
    );
  }

  @Post('sign-in')
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Sign in with email and password',
    description:
      'Sign in with a verified email address. A successful response sets the HttpOnly session cookie; preserve it for subsequent API requests.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @AllowAnonymous()
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  async signInEmail(
    @Body() body: SignInDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await sendAuthResponse(
      response,
      await this.authenticationService.signInEmail(body, request.headers),
    );
  }

  @Post('sign-out')
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Sign out of the current session',
    description:
      'Invalidate the current session and clear its authentication cookies.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @AllowAnonymous()
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  async signOut(@Req() request: Request, @Res() response: Response) {
    await sendAuthResponse(
      response,
      await this.authenticationService.signOut(request.headers),
    );
  }

  @Get('ok')
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Check authentication availability',
    description:
      'Return the authentication service status. No session is required.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @AllowAnonymous()
  async ok(@Req() request: Request, @Res() response: Response) {
    await sendAuthResponse(
      response,
      await this.authenticationService.ok(request.headers),
    );
  }

  @Get('error')
  @SkipResponseTransform()
  @ApiOperation({
    summary: 'Read an OAuth failure',
    description:
      'Return a JSON object containing code and message from an OAuth failure. No session is required.',
  })
  @ApiResponse({ status: 200, description: 'Better Auth response' })
  @AllowAnonymous()
  async error(@Query() query: AuthErrorDto, @Res() response: Response) {
    await sendAuthResponse(response, this.authenticationService.error(query));
  }
}
