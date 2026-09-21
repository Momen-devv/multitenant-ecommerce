import { HttpException, Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { isAPIError } from 'better-auth/api';
import type { Auth } from '@/core/auth/auth';
import type { OrganizationRole } from '@/common/enums';
import type { StoreMembershipContext } from '@/common/guards/store-membership.guard';
import type {
  InviteStoreMemberDto,
  ListStoreMembersDto,
  UpdateStoreMemberRoleDto,
} from '../dto';

type NodeHeaders = Record<string, string>;

@Injectable()
export class StoreMembershipService {
  constructor(private readonly authService: AuthService<Auth>) {}

  async getAccess(context: StoreMembershipContext) {
    return context;
  }

  async getFullOrganization(
    context: StoreMembershipContext,
    headers: NodeHeaders,
  ) {
    return this.callAuth(() =>
      this.authService.api.getFullOrganization({
        query: {
          organizationId: context.organizationId,
          membersLimit: 100,
        },
        headers: fromNodeHeaders(headers),
      }),
    );
  }

  async listMembers(
    context: StoreMembershipContext,
    query: ListStoreMembersDto,
    headers: NodeHeaders,
  ) {
    return this.callAuth(() =>
      this.authService.api.listMembers({
        query: {
          organizationId: context.organizationId,
          limit: query.limit,
          offset: query.offset,
        },
        headers: fromNodeHeaders(headers),
      }),
    );
  }

  async listInvitations(context: StoreMembershipContext, headers: NodeHeaders) {
    return this.callAuth(() =>
      this.authService.api.listInvitations({
        query: { organizationId: context.organizationId },
        headers: fromNodeHeaders(headers),
      }),
    );
  }

  async listUserInvitations(headers: NodeHeaders) {
    return this.callAuth(() =>
      this.authService.api.listUserInvitations({
        headers: fromNodeHeaders(headers),
      }),
    );
  }

  async getInvitation(invitationId: string, headers: NodeHeaders) {
    return this.callAuth(() =>
      this.authService.api.getInvitation({
        query: { id: invitationId },
        headers: fromNodeHeaders(headers),
      }),
    );
  }

  async acceptInvitation(invitationId: string, headers: NodeHeaders) {
    return this.callAuth(() =>
      this.authService.api.acceptInvitation({
        body: { invitationId },
        headers: fromNodeHeaders(headers),
      }),
    );
  }

  async rejectInvitation(invitationId: string, headers: NodeHeaders) {
    return this.callAuth(() =>
      this.authService.api.rejectInvitation({
        body: { invitationId },
        headers: fromNodeHeaders(headers),
      }),
    );
  }

  async inviteMember(
    context: StoreMembershipContext,
    dto: InviteStoreMemberDto,
    headers: NodeHeaders,
  ) {
    return this.callAuth(() =>
      this.authService.api.createInvitation({
        body: {
          email: dto.email,
          role: dto.role,
          organizationId: context.organizationId,
        },
        headers: fromNodeHeaders(headers),
      }),
    );
  }

  async cancelInvitation(
    context: StoreMembershipContext,
    invitationId: string,
    headers: NodeHeaders,
  ) {
    return this.callAuth(() =>
      this.authService.api.cancelInvitation({
        body: { invitationId },
        headers: fromNodeHeaders(headers),
      }),
    );
  }

  async updateMemberRole(
    context: StoreMembershipContext,
    memberId: string,
    dto: UpdateStoreMemberRoleDto,
    headers: NodeHeaders,
  ) {
    return this.callAuth(() =>
      this.authService.api.updateMemberRole({
        body: {
          memberId,
          role: dto.role as OrganizationRole,
          organizationId: context.organizationId,
        },
        headers: fromNodeHeaders(headers),
      }),
    );
  }

  async removeMember(
    context: StoreMembershipContext,
    memberId: string,
    headers: NodeHeaders,
  ) {
    return this.callAuth(() =>
      this.authService.api.removeMember({
        body: {
          memberIdOrEmail: memberId,
          organizationId: context.organizationId,
        },
        headers: fromNodeHeaders(headers),
      }),
    );
  }

  async leave(context: StoreMembershipContext, headers: NodeHeaders) {
    return this.callAuth(() =>
      this.authService.api.leaveOrganization({
        body: { organizationId: context.organizationId },
        headers: fromNodeHeaders(headers),
      }),
    );
  }

  private async callAuth<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isAPIError(error)) {
        throw new HttpException(
          error.body?.message ?? error.message,
          error.statusCode,
        );
      }
      throw error;
    }
  }
}
