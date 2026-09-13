import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { ApiErrorResponse, ApiSuccessResponse } from '@/common/decorators';
import { ConfirmPhoneChangeDto, RequestPhoneChangeDto } from '../dto';
import { PhoneService } from '../services/phone.service';

@ApiTags('Phone')
@ApiCookieAuth()
@Controller('users/phone')
export class PhoneController {
  constructor(private readonly phoneService: PhoneService) {}

  @ApiOperation({
    summary: 'Send an SMS code to change the current phone number',
  })
  @ApiSuccessResponse({ description: 'Verification code sent successfully' })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authentication is required.')
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'The phone number is invalid.')
  @ApiErrorResponse(
    HttpStatus.TOO_MANY_REQUESTS,
    'Too many requests. Rate limit exceeded (3 requests / 5min).',
  )
  @Throttle({ default: { limit: 3, ttl: seconds(300) } })
  @ResponseMessage('Verification code sent successfully')
  @HttpCode(HttpStatus.OK)
  @Post('change/request')
  async requestChange(
    @Body() dto: RequestPhoneChangeDto,
    @Headers() headers: Record<string, string>,
  ) {
    await this.phoneService.requestChange(dto, headers);
  }

  @ApiOperation({ summary: 'Verify and set the current phone number' })
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

  @ApiOperation({ summary: 'Remove the current phone number' })
  @ApiSuccessResponse({ description: 'Phone number removed successfully' })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authentication is required.')
  @Throttle({ default: { limit: 3, ttl: seconds(300) } })
  @ResponseMessage('Phone number removed successfully')
  @HttpCode(HttpStatus.OK)
  @Delete()
  async remove(@Headers() headers: Record<string, string>) {
    await this.phoneService.remove(headers);
  }
}
