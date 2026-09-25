import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiSuccessResponse, ResponseMessage } from '@/common/decorators';
import { StoreMembershipService } from '../services/store-membership.service';

@ApiTags('Store Invitations')
@ApiCookieAuth('mte.session_token')
@Controller('stores/invitations')
export class StoreInvitationsController {
  constructor(private readonly membershipService: StoreMembershipService) {}

  @Get()
  @ApiOperation({ summary: 'List invitations received by the current user' })
  @ApiSuccessResponse({
    description: 'User invitations retrieved successfully',
  })
  @ResponseMessage('User invitations retrieved successfully')
  listUserInvitations(@Headers() headers: Record<string, string>) {
    return this.membershipService.listUserInvitations(headers);
  }

  @Get(':invitationId')
  @ApiOperation({
    summary: 'Get a store invitation received by the current user',
  })
  @ApiSuccessResponse({
    description: 'Store invitation retrieved successfully',
  })
  @ResponseMessage('Store invitation retrieved successfully')
  getInvitation(
    @Param('invitationId') invitationId: string,
    @Headers() headers: Record<string, string>,
  ) {
    return this.membershipService.getInvitation(invitationId, headers);
  }

  @Post(':invitationId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a store invitation' })
  @ApiSuccessResponse({ description: 'Store invitation accepted successfully' })
  @ResponseMessage('Store invitation accepted successfully')
  acceptInvitation(
    @Param('invitationId') invitationId: string,
    @Headers() headers: Record<string, string>,
  ) {
    return this.membershipService.acceptInvitation(invitationId, headers);
  }

  @Post(':invitationId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a store invitation' })
  @ApiSuccessResponse({ description: 'Store invitation rejected successfully' })
  @ResponseMessage('Store invitation rejected successfully')
  rejectInvitation(
    @Param('invitationId') invitationId: string,
    @Headers() headers: Record<string, string>,
  ) {
    return this.membershipService.rejectInvitation(invitationId, headers);
  }
}
