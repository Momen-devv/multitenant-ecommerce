import { Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { Auth } from '@/core/auth/auth';
import type { ConfirmPhoneChangeDto, RequestPhoneChangeDto } from '../dto';

@Injectable()
export class PhoneService {
  constructor(private readonly authService: AuthService<Auth>) {}

  async requestChange(
    dto: RequestPhoneChangeDto,
    headers: Record<string, string>,
  ) {
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
}
