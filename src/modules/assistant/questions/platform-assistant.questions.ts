import { choice } from '@typesafe-ai/sdk';
import { PlatformAssistantAction } from '@/common/enums';

export const platformAssistantQuestions = {
  action: choice(
    {
      task: 'Identify the single supported action requested by `command`.',
      rules: [
        'Choose based on the requested intent, not only on a matching keyword.',
        `Choose ${PlatformAssistantAction.BAN_USER_WITH_TIME} only when the command requests a duration such as 2 days, one week, or a month.`,
        `Choose ${PlatformAssistantAction.REVOKE_USER_SESSION} only when one specific session is targeted; choose ${PlatformAssistantAction.REVOKE_USER_SESSIONS} for all sessions.`,
        'All IDs provided in the command, including store IDs and session IDs, must use UUIDv7 format.',
        `Choose ${PlatformAssistantAction.ACTIVATE_USER} and ${PlatformAssistantAction.DEACTIVATE_USER} only for user accounts, not stores.`,
        `Choose ${PlatformAssistantAction.SUSPEND_STORE} and ${PlatformAssistantAction.REACTIVATE_STORE} only for stores identified by a UUIDv7 store ID.`,
        `Choose ${PlatformAssistantAction.SOME_OTHER_ACTION} when the request does not clearly match one supported action.`,
        'Do not reject an action because an email, ID, session ID, or duration is missing; the application validates required fields after routing.',
      ],
    },
    {
      [PlatformAssistantAction.BAN_USER]:
        'Permanently ban a user from the platform. Use for commands like "ban user person@example.com" when no duration is requested.',
      [PlatformAssistantAction.BAN_USER_WITH_TIME]:
        'Temporarily ban a user for a requested duration. Use for commands like "ban person@example.com for 7 days" or "ban for one month".',
      [PlatformAssistantAction.UNBAN_USER]:
        'Remove a platform ban from a user. Use for commands like "unban person@example.com".',
      [PlatformAssistantAction.DEACTIVATE_USER]:
        'Make a user account inactive or deactivate it. This is for user accounts, not stores.',
      [PlatformAssistantAction.ACTIVATE_USER]:
        'Make a user account active or reactivate it. This is for user accounts, not stores.',
      [PlatformAssistantAction.REVOKE_USER_SESSIONS]:
        'Revoke every active session belonging to a user. Use when the command says all sessions, every session, or revoke sessions generally.',
      [PlatformAssistantAction.REVOKE_USER_SESSION]:
        'Revoke one specific user session. Use only when the command identifies one UUIDv7 session ID.',
      [PlatformAssistantAction.LIST_USER_SESSIONS]:
        'List or display all active sessions belonging to a user.',
      [PlatformAssistantAction.MAKE_USER_SUPER_ADMIN]:
        'Change a user role to platform super admin.',
      [PlatformAssistantAction.MAKE_USER_NORMAL_USER]:
        'Change a user role to the normal user role, removing elevated platform-admin access.',
      [PlatformAssistantAction.SUSPEND_STORE]:
        'Suspend a store identified by a UUIDv7 store ID. Do not use for suspending a user account.',
      [PlatformAssistantAction.REACTIVATE_STORE]:
        'Reactivate a suspended or closed store identified by a UUIDv7 store ID.',
      [PlatformAssistantAction.SOME_OTHER_ACTION]:
        'The command is unclear, asks for an unsupported operation, or does not match any listed action.',
    },
  ),
};
