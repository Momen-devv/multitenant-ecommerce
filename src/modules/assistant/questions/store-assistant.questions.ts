import { choice } from '@typesafe-ai/sdk';
import { StoreAssistantAction } from '@/common/enums';

export const storeAssistantQuestions = {
  action: choice(
    {
      task: 'Identify the single supported store-management action requested by `command`.',
      rules: [
        'Choose based on the requested intent, not only on a matching keyword.',
        'The command applies to the current store from the authenticated store membership context.',
        `Choose ${StoreAssistantAction.INVITE_STORE_MANAGER} when the command asks to invite a manager.`,
        `Choose ${StoreAssistantAction.INVITE_STORE_SUPPORT} when the command asks to invite a support member.`,
        `Choose ${StoreAssistantAction.MAKE_MEMBER_OWNER}, ${StoreAssistantAction.MAKE_MEMBER_MANAGER}, or ${StoreAssistantAction.MAKE_MEMBER_SUPPORT} based on the requested new role for an existing member.`,
        `Choose ${StoreAssistantAction.CANCEL_STORE_INVITATION} only when the command asks to cancel an invitation.`,
        `Choose ${StoreAssistantAction.SOME_OTHER_ACTION} when the request does not clearly match one supported action.`,
        'Do not reject an action because an email is missing; the application validates required fields after routing.',
      ],
    },
    {
      [StoreAssistantAction.INVITE_STORE_MANAGER]:
        'Invite a person as a manager to the current store. The command should include an email.',
      [StoreAssistantAction.INVITE_STORE_SUPPORT]:
        'Invite a person as support to the current store. The command should include an email.',
      [StoreAssistantAction.CANCEL_STORE_INVITATION]:
        'Cancel one invitation for the current store. The command should include the invitee email.',
      [StoreAssistantAction.MAKE_MEMBER_OWNER]:
        'Change one current store member to the owner role. The command should include the member email.',
      [StoreAssistantAction.MAKE_MEMBER_MANAGER]:
        'Change one current store member to the manager role. The command should include the member email.',
      [StoreAssistantAction.MAKE_MEMBER_SUPPORT]:
        'Change one current store member to the support role. The command should include the member email.',
      [StoreAssistantAction.REMOVE_STORE_MEMBER]:
        'Remove one member from the current store. The command should include the member email.',
      [StoreAssistantAction.LEAVE_STORE]:
        'Leave the current store organization.',
      [StoreAssistantAction.SOME_OTHER_ACTION]:
        'The command is unclear, asks for an unsupported operation, or does not match any listed action.',
    },
  ),
};
