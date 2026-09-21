import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgRoles } from '@thallesp/nestjs-better-auth';
import { OrganizationRole } from '@/common/enums';
import {
  ApiSuccessResponse,
  ResponseMessage,
  StoreMembership,
} from '@/common/decorators';
import {
  StoreMembershipGuard,
  type StoreMembershipContext,
} from '@/common/guards/store-membership.guard';
import {
  InviteStoreMemberDto,
  ListStoreMembersDto,
  UpdateStoreMemberRoleDto,
} from '../dto';
import { StoreMembershipService } from '../services/store-membership.service';

@ApiTags('Store Membership')
@ApiCookieAuth('mte.session_token')
@UseGuards(StoreMembershipGuard)
@Controller('stores/me')
export class StoreMembershipController {
  constructor(private readonly membershipService: StoreMembershipService) {}

  @Get('access')
  @OrgRoles([
    OrganizationRole.OWNER,
    OrganizationRole.MANAGER,
    OrganizationRole.SUPPORT,
  ])
  @ApiOperation({ summary: 'Get the current user store membership' })
  @ApiSuccessResponse({ description: 'Store access retrieved successfully' })
  @ResponseMessage('Store access retrieved successfully')
  getAccess(@StoreMembership() context: StoreMembershipContext) {
    return this.membershipService.getAccess(context);
  }

  @Get('organization')
  @OrgRoles([
    OrganizationRole.OWNER,
    OrganizationRole.MANAGER,
    OrganizationRole.SUPPORT,
  ])
  @ApiOperation({ summary: 'Get the current store organization and members' })
  @ApiSuccessResponse({
    description: 'Store organization retrieved successfully',
  })
  @ResponseMessage('Store organization retrieved successfully')
  getFullOrganization(
    @Headers() headers: Record<string, string>,
    @StoreMembership() context: StoreMembershipContext,
  ) {
    return this.membershipService.getFullOrganization(context, headers);
  }

  @Get('members')
  @OrgRoles([
    OrganizationRole.OWNER,
    OrganizationRole.MANAGER,
    OrganizationRole.SUPPORT,
  ])
  @ApiOperation({ summary: 'List members of the current store' })
  @ApiSuccessResponse({ description: 'Store members retrieved successfully' })
  @ResponseMessage('Store members retrieved successfully')
  listMembers(
    @Query() query: ListStoreMembersDto,
    @Headers() headers: Record<string, string>,
    @StoreMembership() context: StoreMembershipContext,
  ) {
    return this.membershipService.listMembers(context, query, headers);
  }

  @Get('invitations')
  @OrgRoles([OrganizationRole.OWNER, OrganizationRole.MANAGER])
  @ApiOperation({ summary: 'List pending invitations for the current store' })
  @ApiSuccessResponse({
    description: 'Store invitations retrieved successfully',
  })
  @ResponseMessage('Store invitations retrieved successfully')
  listInvitations(
    @Headers() headers: Record<string, string>,
    @StoreMembership() context: StoreMembershipContext,
  ) {
    return this.membershipService.listInvitations(context, headers);
  }

  @Post('invitations')
  @OrgRoles([OrganizationRole.OWNER, OrganizationRole.MANAGER])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite a member to the current store' })
  @ApiSuccessResponse({ description: 'Store invitation created successfully' })
  @ResponseMessage('Store invitation created successfully')
  inviteMember(
    @Body() dto: InviteStoreMemberDto,
    @Headers() headers: Record<string, string>,
    @StoreMembership() context: StoreMembershipContext,
  ) {
    return this.membershipService.inviteMember(context, dto, headers);
  }

  @Delete('invitations/:invitationId')
  @OrgRoles([OrganizationRole.OWNER, OrganizationRole.MANAGER])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a store invitation' })
  @ApiSuccessResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Store invitation cancelled successfully',
  })
  @ResponseMessage('Store invitation cancelled successfully')
  async cancelInvitation(
    @Param('invitationId') invitationId: string,
    @Headers() headers: Record<string, string>,
    @StoreMembership() context: StoreMembershipContext,
  ) {
    await this.membershipService.cancelInvitation(
      context,
      invitationId,
      headers,
    );
  }

  @Patch('members/:memberId/role')
  @OrgRoles([OrganizationRole.OWNER])
  @ApiOperation({ summary: 'Update a store member role' })
  @ApiSuccessResponse({ description: 'Store member role updated successfully' })
  @ResponseMessage('Store member role updated successfully')
  updateMemberRole(
    @Param('memberId') memberId: string,
    @Body() dto: UpdateStoreMemberRoleDto,
    @Headers() headers: Record<string, string>,
    @StoreMembership() context: StoreMembershipContext,
  ) {
    return this.membershipService.updateMemberRole(
      context,
      memberId,
      dto,
      headers,
    );
  }

  @Delete('members/:memberId')
  @OrgRoles([OrganizationRole.OWNER, OrganizationRole.MANAGER])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the current store' })
  @ApiSuccessResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Store member removed successfully',
  })
  @ResponseMessage('Store member removed successfully')
  async removeMember(
    @Param('memberId') memberId: string,
    @Headers() headers: Record<string, string>,
    @StoreMembership() context: StoreMembershipContext,
  ) {
    await this.membershipService.removeMember(context, memberId, headers);
  }

  @Post('leave')
  @OrgRoles([
    OrganizationRole.OWNER,
    OrganizationRole.MANAGER,
    OrganizationRole.SUPPORT,
  ])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Leave the current store' })
  @ApiSuccessResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'You left the store successfully',
  })
  @ResponseMessage('You left the store successfully')
  async leave(
    @Headers() headers: Record<string, string>,
    @StoreMembership() context: StoreMembershipContext,
  ) {
    await this.membershipService.leave(context, headers);
  }
}
