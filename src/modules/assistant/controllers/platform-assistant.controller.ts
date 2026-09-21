import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Session,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@thallesp/nestjs-better-auth';
import { ApiErrorResponse, ApiSuccessResponse } from '@/common/decorators';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { AuthRole } from '@/common/enums';
import type { CurrentUser } from '@/core/auth/auth.types';
import { AssistantCommandDto } from '../dto';
import { PlatformAssistantService } from '../services/platform-assistant.service';

@ApiTags('Platform AI Assistant')
@ApiCookieAuth('mte.session_token')
@Roles([AuthRole.PLATFORM_SUPER_ADMIN])
@ApiErrorResponse(HttpStatus.FORBIDDEN, 'Platform super-admin role required')
@Controller('platform/assistant')
export class PlatformAssistantController {
  constructor(private readonly assistantService: PlatformAssistantService) {}

  @ApiOperation({ summary: 'Submit a command to the Platform AI Assistant' })
  @ApiSuccessResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Platform AI Assistant command accepted',
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid assistant command')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ResponseMessage('Assistant command accepted')
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('commands')
  executeCommand(
    @Body() dto: AssistantCommandDto,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    return this.assistantService.executeCommand(dto, headers, session.user.id);
  }
}
