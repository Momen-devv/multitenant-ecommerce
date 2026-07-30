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
import { AllowAnonymous, type UserSession } from '@thallesp/nestjs-better-auth';
import { ConfirmReactivationDto, RequestReactivationDto } from '../dto';
import { seconds, Throttle } from '@nestjs/throttler';

@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  @ResponseMessage('Account deactivated successfully')
  @HttpCode(HttpStatus.OK)
  @Post('deactivate')
  async deactivateAccount(
    @Session() session: UserSession,
    @Headers() headers: Record<string, string>,
  ) {
    await this.accountService.deactivateAccount(
      session.user.id,
      session.user.email,
      headers,
    );
  }

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

  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @AllowAnonymous()
  @ResponseMessage('Account reactivated successfully')
  @HttpCode(HttpStatus.OK)
  @Get('reactivate/confirm')
  async confirmReactivation(@Query() dto: ConfirmReactivationDto) {
    await this.accountService.confirmReactivation(dto.token, dto.userId);
  }
}
