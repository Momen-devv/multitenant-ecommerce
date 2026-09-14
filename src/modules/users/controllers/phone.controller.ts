import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous, Session } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  SkipResponseTransform,
} from '@/common/decorators';
import type { CurrentUser } from '@/core/auth/auth.types';
import {
  ConfirmPhoneChangeDto,
  PhoneSignInDto,
  RequestPhoneChangeDto,
  RequestPhonePasswordResetDto,
  ResetPhonePasswordDto,
} from '../dto';
import { PhoneService } from '../services/phone.service';

@ApiTags('Phone')
@ApiCookieAuth()
@Controller('users/phone')
export class PhoneController {
  constructor(private readonly phoneService: PhoneService) {}

  @ApiOperation({
    summary: 'Send an OTP to a new phone number',
  })
  @ApiSuccessResponse({ description: 'Verification code sent successfully' })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authentication is required.')
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'The phone number is invalid.')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Phone number is already verified.')
  @ApiErrorResponse(
    HttpStatus.TOO_MANY_REQUESTS,
    'Too many requests. Rate limit exceeded (3 requests / 5min).',
  )
  @Throttle({ default: { limit: 3, ttl: seconds(300) } })
  @ResponseMessage('Verification code sent successfully')
  @HttpCode(HttpStatus.OK)
  @Post('change/request')
  async requestChange(
    @Session() session: CurrentUser,
    @Body() dto: RequestPhoneChangeDto,
    @Headers() headers: Record<string, string>,
  ) {
    await this.phoneService.requestChange(
      dto,
      session.user.phoneNumber,
      session.user.phoneNumberVerified,
      headers,
    );
  }

  @ApiOperation({
    summary: 'Verify and change the current phone number',
  })
  @ApiSuccessResponse({ description: 'Phone number updated successfully' })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authentication is required.')
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'The verification code is invalid or expired.',
  )
  @ApiErrorResponse(
    HttpStatus.TOO_MANY_REQUESTS,
    'Too many requests. Rate limit exceeded (5 requests / 5min).',
  )
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  @ResponseMessage('Phone number updated successfully')
  @HttpCode(HttpStatus.OK)
  @Post('change/confirm')
  async confirmChange(
    @Body() dto: ConfirmPhoneChangeDto,
    @Headers() headers: Record<string, string>,
  ) {
    await this.phoneService.confirmChange(dto, headers);
  }

  @ApiOperation({
    summary: 'Remove the current phone number',
  })
  @ApiSuccessResponse({ description: 'Phone number removed successfully' })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authentication is required.')
  @Throttle({ default: { limit: 3, ttl: seconds(300) } })
  @ResponseMessage('Phone number removed successfully')
  @HttpCode(HttpStatus.OK)
  @Delete()
  async remove(@Headers() headers: Record<string, string>) {
    await this.phoneService.remove(headers);
  }

  @SkipResponseTransform()
  @AllowAnonymous()
  @ApiOperation({
    summary: 'Sign in with a phone number and password',
  })
  @ApiSuccessResponse({ description: 'Signed in successfully' })
  @ApiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    'Invalid phone number or password.',
  )
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ResponseMessage('Signed in successfully')
  @HttpCode(HttpStatus.OK)
  @Post('sign-in')
  async signIn(
    @Body() dto: PhoneSignInDto,
    @Headers() headers: Record<string, string>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.phoneService.signIn(dto, headers);
    this.forwardSessionCookies(response, result.headers);
    return result.response;
  }

  @AllowAnonymous()
  @ApiOperation({
    summary: 'Send a password-reset OTP to a verified phone number',
  })
  @ApiSuccessResponse({
    description: 'Password-reset OTP processed successfully',
  })
  @Throttle({ default: { limit: 3, ttl: seconds(300) } })
  @ResponseMessage('If the phone number belongs to an account, an OTP was sent')
  @HttpCode(HttpStatus.OK)
  @Post('password-reset/request')
  async requestPasswordReset(
    @Body() dto: RequestPhonePasswordResetDto,
    @Headers() headers: Record<string, string>,
  ) {
    return this.phoneService.requestPasswordReset(dto, headers);
  }

  @AllowAnonymous()
  @ApiOperation({ summary: 'Reset a password using a phone OTP' })
  @ApiSuccessResponse({ description: 'Password reset successfully' })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'The OTP is invalid or expired.')
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  @ResponseMessage('Password reset successfully')
  @HttpCode(HttpStatus.OK)
  @Post('password-reset/confirm')
  async resetPassword(
    @Body() dto: ResetPhonePasswordDto,
    @Headers() headers: Record<string, string>,
  ) {
    return this.phoneService.resetPassword(dto, headers);
  }

  private forwardSessionCookies(response: Response, headers?: Headers) {
    if (!headers) return;

    const cookies = headers.getSetCookie();
    if (cookies.length) response.append('Set-Cookie', cookies);
  }
}
