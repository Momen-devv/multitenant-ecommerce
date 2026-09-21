import { HttpException, Inject, Injectable } from '@nestjs/common';
import { OrganizationRole, StoreAssistantAction } from '@/common/enums';
import type { StoreMembershipContext } from '@/common/guards/store-membership.guard';
import {
  ASSISTANT_REPOSITORY,
  type IAssistantRepository,
} from '../interfaces/repos';
import {
  InviteStoreMemberDto,
  UpdateStoreMemberRoleDto,
} from '@/modules/stores/dto';
import { StoreMembershipService } from '@/modules/stores/services/store-membership.service';
import { extractEmail } from '@/common/utils';
import type { AssistantHeaders } from '../types';

type ExecutableStoreAssistantAction = Exclude<
  StoreAssistantAction,
  StoreAssistantAction.SOME_OTHER_ACTION
>;

@Injectable()
export class StoreAssistantActionsService {
  constructor(
    private readonly storeMembershipService: StoreMembershipService,
    @Inject(ASSISTANT_REPOSITORY)
    private readonly assistantRepository: IAssistantRepository,
  ) {}

  async executeAction(
    action: ExecutableStoreAssistantAction,
    command: string,
    context: StoreMembershipContext,
    headers: AssistantHeaders,
  ) {
    try {
      switch (action) {
        case StoreAssistantAction.INVITE_STORE_MANAGER: {
          const email = extractEmail(command);
          if (!email) {
            return {
              action,
              message:
                'You should provide an email to invite the store member.',
            };
          }

          const dto: InviteStoreMemberDto = {
            email,
            role: OrganizationRole.MANAGER,
          };

          await this.storeMembershipService.inviteMember(context, dto, headers);

          return {
            action,
            message: `Invitation sent to ${email} successfully.`,
          };
        }

        case StoreAssistantAction.INVITE_STORE_SUPPORT: {
          const email = extractEmail(command);
          if (!email) {
            return {
              action,
              message:
                'You should provide an email to invite the store member.',
            };
          }

          const dto: InviteStoreMemberDto = {
            email,
            role: OrganizationRole.SUPPORT,
          };

          await this.storeMembershipService.inviteMember(context, dto, headers);

          return {
            action,
            message: `Invitation sent to ${email} successfully.`,
          };
        }

        case StoreAssistantAction.CANCEL_STORE_INVITATION: {
          const email = extractEmail(command);
          if (!email) {
            return {
              action,
              message:
                'You should provide the invitee email to cancel the invitation.',
            };
          }

          const invitationId =
            await this.assistantRepository.findInvitationIdByEmail(
              context.organizationId,
              email,
            );
          if (!invitationId) {
            return {
              action,
              message: 'No invitation was found for the provided email.',
            };
          }

          await this.storeMembershipService.cancelInvitation(
            context,
            invitationId,
            headers,
          );

          return {
            action,
            message: 'Store invitation cancelled successfully.',
          };
        }

        case StoreAssistantAction.MAKE_MEMBER_OWNER: {
          const email = extractEmail(command);
          if (!email) {
            return {
              action,
              message: 'You should provide the member email to update it.',
            };
          }

          const memberId = await this.assistantRepository.findMemberIdByEmail(
            context.organizationId,
            email,
          );
          if (!memberId) {
            return {
              action,
              message: 'No store member was found with the provided email.',
            };
          }

          const dto: UpdateStoreMemberRoleDto = {
            role: OrganizationRole.OWNER,
          };
          await this.storeMembershipService.updateMemberRole(
            context,
            memberId,
            dto,
            headers,
          );

          return {
            action,
            message: 'Store member role updated successfully.',
          };
        }

        case StoreAssistantAction.MAKE_MEMBER_MANAGER: {
          const email = extractEmail(command);
          if (!email) {
            return {
              action,
              message: 'You should provide the member email to update it.',
            };
          }

          const memberId = await this.assistantRepository.findMemberIdByEmail(
            context.organizationId,
            email,
          );
          if (!memberId) {
            return {
              action,
              message: 'No store member was found with the provided email.',
            };
          }

          const dto: UpdateStoreMemberRoleDto = {
            role: OrganizationRole.MANAGER,
          };
          await this.storeMembershipService.updateMemberRole(
            context,
            memberId,
            dto,
            headers,
          );

          return {
            action,
            message: 'Store member role updated successfully.',
          };
        }

        case StoreAssistantAction.MAKE_MEMBER_SUPPORT: {
          const email = extractEmail(command);
          if (!email) {
            return {
              action,
              message: 'You should provide the member email to update it.',
            };
          }

          const memberId = await this.assistantRepository.findMemberIdByEmail(
            context.organizationId,
            email,
          );
          if (!memberId) {
            return {
              action,
              message: 'No store member was found with the provided email.',
            };
          }

          const dto: UpdateStoreMemberRoleDto = {
            role: OrganizationRole.SUPPORT,
          };
          await this.storeMembershipService.updateMemberRole(
            context,
            memberId,
            dto,
            headers,
          );

          return {
            action,
            message: 'Store member role updated successfully.',
          };
        }

        case StoreAssistantAction.REMOVE_STORE_MEMBER: {
          const email = extractEmail(command);
          if (!email) {
            return {
              action,
              message: 'You should provide the member email to remove it.',
            };
          }

          await this.storeMembershipService.removeMember(
            context,
            email,
            headers,
          );

          return {
            action,
            message: 'Store member removed successfully.',
          };
        }

        case StoreAssistantAction.LEAVE_STORE:
          await this.storeMembershipService.leave(context, headers);
          return { action, message: 'You left the store successfully.' };

        default:
          return this.assertUnreachable(action);
      }
    } catch (error) {
      return {
        action,
        message: this.getActionErrorMessage(error),
      };
    }
  }

  private getActionErrorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      return error.message;
    }

    return 'The action could not be completed. Please try again.';
  }

  private assertUnreachable(action: never): never {
    void action;
    throw new Error('Unhandled store assistant action');
  }
}
