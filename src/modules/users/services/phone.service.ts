import { ConflictException, Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { Auth } from '@/core/auth/auth';
import type {
  ConfirmPhoneChangeDto,
  PhoneSignInDto,
  RequestPhoneChangeDto,
  RequestPhonePasswordResetDto,
  ResetPhonePasswordDto,
} from '../dto';

@Injectable()
export class PhoneService {
  constructor(private readonly authService: AuthService<Auth>) {}

  async requestChange(
    dto: RequestPhoneChangeDto,
    currentPhoneNumber: string | null | undefined,
    phoneNumberVerified: boolean | null | undefined,
    headers: Record<string, string>,
  ) {
    if (phoneNumberVerified && currentPhoneNumber === dto.phoneNumber) {
      throw new ConflictException('Phone number is already verified.');
    }

    await this.authService.api.sendPhoneNumberOTP({
      body: { phoneNumber: dto.phoneNumber },
      headers: fromNodeHeaders(headers),
    });
  }

  async confirmChange(
    dto: ConfirmPhoneChangeDto,
    headers: Record<string, string>,
  ) {
    await this.authService.api.verifyPhoneNumber({
      body: {
        phoneNumber: dto.phoneNumber,
        code: dto.code,
        updatePhoneNumber: true,
        disableSession: true,
      },
      headers: fromNodeHeaders(headers),
    });
  }

  async remove(headers: Record<string, string>) {
    await this.authService.api.updateUser({
      body: { phoneNumber: null },
      headers: fromNodeHeaders(headers),
    });
  }

  async signIn(dto: PhoneSignInDto, headers: Record<string, string>) {
    return this.authService.api.signInPhoneNumber({
      body: dto,
      headers: fromNodeHeaders(headers),
      returnHeaders: true,
    });
  }

  async requestPasswordReset(
    dto: RequestPhonePasswordResetDto,
    headers: Record<string, string>,
  ) {
    return this.authService.api.requestPasswordResetPhoneNumber({
      body: dto,
      headers: fromNodeHeaders(headers),
    });
  }

  async resetPassword(
    dto: ResetPhonePasswordDto,
    headers: Record<string, string>,
  ) {
    return this.authService.api.resetPasswordPhoneNumber({
      body: dto,
      headers: fromNodeHeaders(headers),
    });
  }
}
