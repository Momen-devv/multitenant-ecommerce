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
} from '@nestjs/common';
import { AccountService } from '../services/account.service';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import type { CurrentUser } from '@/core/auth/auth.types';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { RequestReactivationDto } from '../dto';

@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @ResponseMessage('Account deactivated successfully')
  @HttpCode(HttpStatus.OK)
  @Post('deactivate')
  async deactivateAccount(
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    await this.accountService.deactivateAccount(
      session.user.id,
      session.user.email,
      headers,
    );
  }

  @AllowAnonymous()
  @ResponseMessage(
    'If an account with this email exists and is deactivated, a reactivation link has been sent.',
  )
  @HttpCode(HttpStatus.OK)
  @Post('reactivate/request')
  async requestReactivation(@Body() dto: RequestReactivationDto) {
    await this.accountService.requestReactivation(dto.email);
  }

  @AllowAnonymous()
  @ResponseMessage('Account reactivated successfully')
  @HttpCode(HttpStatus.OK)
  @Get('reactivate/confirm')
  async confirmReactivation(
    @Query('token') token: string,
    @Query('userId') userId: string,
  ) {
    await this.accountService.confirmReactivation(token, userId);
  }
}
