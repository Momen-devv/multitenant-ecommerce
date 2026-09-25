import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { OrgRoles } from '@thallesp/nestjs-better-auth';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
  StoreMembership,
} from '@/common/decorators';
import {
  StoreMembershipGuard,
  type StoreMembershipContext,
} from '@/common/guards/store-membership.guard';
import { OrganizationRole } from '@/common/enums';
import { AssistantCommandDto } from '../dto';
import { StoreAssistantService } from '../services/store-assistant.service';

@ApiTags('Store AI Assistant')
@ApiCookieAuth('mte.session_token')
@UseGuards(StoreMembershipGuard)
@Controller('stores/me/assistant')
export class StoreAssistantController {
  constructor(private readonly storeAssistantService: StoreAssistantService) {}

  @Post('commands')
  @OrgRoles([OrganizationRole.OWNER])
  @ApiSuccessResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Store AI Assistant command accepted',
  })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Store membership required')
  @ResponseMessage('Store AI Assistant command accepted')
  @HttpCode(HttpStatus.ACCEPTED)
  executeCommand(
    @Body() dto: AssistantCommandDto,
    @Headers() headers: Record<string, string>,
    @StoreMembership() context: StoreMembershipContext,
  ) {
    return this.storeAssistantService.executeCommand(dto, context, headers);
  }
}
