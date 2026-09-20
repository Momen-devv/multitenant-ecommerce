import {
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { PlatformAssistantAction } from '@/common/enums';
import {
  ASSISTANT_REPOSITORY,
  type IAssistantRepository,
} from '../interfaces/repos';
import { parseBanDurationInSeconds } from '@/common/utils';
import { AuthRole } from '@/common/enums';
import { PlatformUsersService } from '@/modules/users/services/platform-users.service';
import { PlatformStoresService } from '@/modules/stores/services/platform-stores.service';

type NodeHeaders = Record<string, string>;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const UUIDV7_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

@Injectable()
export class PlatformAssistantActionsService {
  constructor(
    @Inject(ASSISTANT_REPOSITORY)
    private readonly assistantRepository: IAssistantRepository,
    private readonly platformUsersService: PlatformUsersService,
    private readonly platformStoresService: PlatformStoresService,
  ) {}

  async executeAction(
    action: PlatformAssistantAction,
    command: string,
    headers: NodeHeaders,
    actorId: string,
  ) {
    switch (action) {
      case PlatformAssistantAction.REVOKE_USER_SESSION: {
        const email = this.extractEmail(command);
        if (!email) return this.missingEmailResponse(action);

        const userId = await this.assistantRepository.findUserIdByEmail(email);
        if (!userId) return this.userNotFoundResponse(action, email);

        const sessionId = this.extractSessionId(command);
        if (!sessionId) {
          return {
            action,
            email,
            message:
              'You should provide the session ID to revoke this session.',
          };
        }
        try {
          await this.platformUsersService.revokeUserSession(
            userId,
            sessionId,
            this.assistantActionReason,
            actorId,
            headers,
          );
        } catch (error) {
          if (!(error instanceof NotFoundException)) throw error;

          return {
            action,
            email,
            sessionId,
            message: 'No session was found with the provided session ID.',
          };
        }

        return {
          action,
          email,
          sessionId,
          message: `Session ${sessionId} for ${email} was revoked successfully.`,
        };
      }

      case PlatformAssistantAction.REVOKE_USER_SESSIONS: {
        const email = this.extractEmail(command);
        if (!email) return this.missingEmailResponse(action);

        const userId = await this.assistantRepository.findUserIdByEmail(email);
        if (!userId) return this.userNotFoundResponse(action, email);

        await this.platformUsersService.revokeUserSessions(
          userId,
          this.assistantActionReason,
          actorId,
          headers,
        );

        return {
          action,
          email,
          message: `All sessions for ${email} were revoked successfully.`,
        };
      }

      case PlatformAssistantAction.LIST_USER_SESSIONS: {
        const email = this.extractEmail(command);
        if (!email) return this.missingEmailResponse(action);

        const userId = await this.assistantRepository.findUserIdByEmail(email);
        if (!userId) return this.userNotFoundResponse(action, email);

        const result = await this.platformUsersService.listUserSessions(
          userId,
          headers,
        );

        return {
          action,
          email,
          message: `Sessions for ${email} retrieved successfully.`,
          sessions: result.sessions,
        };
      }

      case PlatformAssistantAction.DEACTIVATE_USER: {
        const email = this.extractEmail(command);
        if (!email) return this.missingEmailResponse(action);

        const userId = await this.assistantRepository.findUserIdByEmail(email);
        if (!userId) return this.userNotFoundResponse(action, email);

        try {
          await this.platformUsersService.deactivateUser(
            userId,
            this.assistantActionReason,
            actorId,
            headers,
          );
        } catch (error) {
          if (!(error instanceof ConflictException)) throw error;

          return {
            action,
            email,
            message: error.message,
          };
        }

        return {
          action,
          email,
          message: `User ${email} was deactivated successfully.`,
        };
      }

      case PlatformAssistantAction.ACTIVATE_USER: {
        const email = this.extractEmail(command);
        if (!email) return this.missingEmailResponse(action);

        const userId = await this.assistantRepository.findUserIdByEmail(email);
        if (!userId) return this.userNotFoundResponse(action, email);

        try {
          await this.platformUsersService.reactivateUser(
            userId,
            this.assistantActionReason,
            actorId,
            headers,
          );
        } catch (error) {
          if (!(error instanceof ConflictException)) throw error;

          return {
            action,
            email,
            message: error.message,
          };
        }

        return {
          action,
          email,
          message: `User ${email} was activated successfully.`,
        };
      }

      case PlatformAssistantAction.BAN_USER: {
        const email = this.extractEmail(command);
        if (!email) return this.missingEmailResponse(action);

        const userId = await this.assistantRepository.findUserIdByEmail(email);
        if (!userId) return this.userNotFoundResponse(action, email);

        await this.platformUsersService.banUser(
          userId,
          { reason: this.assistantActionReason },
          actorId,
          headers,
        );

        return {
          action,
          email,
          message: `User ${email} was banned successfully.`,
        };
      }
      case PlatformAssistantAction.BAN_USER_WITH_TIME: {
        const email = this.extractEmail(command);
        if (!email) return this.missingEmailResponse(action);

        const userId = await this.assistantRepository.findUserIdByEmail(email);
        if (!userId) return this.userNotFoundResponse(action, email);

        const banExpiresIn = parseBanDurationInSeconds(command);
        if (banExpiresIn === undefined) {
          return {
            action,
            email,
            message:
              'Please provide a duration, for example: "ban test@example.com for 7 days".',
          };
        }

        await this.platformUsersService.banUser(
          userId,
          {
            reason: this.assistantActionReason,
            expiresIn: banExpiresIn,
          },
          actorId,
          headers,
        );

        return {
          action,
          email,
          message: `User ${email} was banned for a limited time successfully.`,
        };
      }
      case PlatformAssistantAction.UNBAN_USER: {
        const email = this.extractEmail(command);
        if (!email) return this.missingEmailResponse(action);

        const userId = await this.assistantRepository.findUserIdByEmail(email);
        if (!userId) return this.userNotFoundResponse(action, email);

        await this.platformUsersService.unbanUser(
          userId,
          this.assistantActionReason,
          actorId,
          headers,
        );

        return {
          action,
          email,
          message: `User ${email} was unbanned successfully.`,
        };
      }
      case PlatformAssistantAction.MAKE_USER_SUPER_ADMIN: {
        const email = this.extractEmail(command);
        if (!email) return this.missingEmailResponse(action);

        const userId = await this.assistantRepository.findUserIdByEmail(email);
        if (!userId) return this.userNotFoundResponse(action, email);

        await this.platformUsersService.setRole(
          userId,
          {
            role: AuthRole.PLATFORM_SUPER_ADMIN,
            reason: this.assistantActionReason,
          },
          actorId,
          headers,
        );

        return {
          action,
          email,
          message: `User ${email} was made a platform super admin successfully.`,
        };
      }

      case PlatformAssistantAction.MAKE_USER_NORMAL_USER: {
        const email = this.extractEmail(command);
        if (!email) return this.missingEmailResponse(action);

        const userId = await this.assistantRepository.findUserIdByEmail(email);
        if (!userId) return this.userNotFoundResponse(action, email);

        await this.platformUsersService.setRole(
          userId,
          {
            role: AuthRole.USER,
            reason: this.assistantActionReason,
          },
          actorId,
          headers,
        );

        return {
          action,
          email,
          message: `User ${email} was made a normal user successfully.`,
        };
      }

      case PlatformAssistantAction.SUSPEND_STORE: {
        const storeId = this.extractStoreId(command);
        if (!storeId) return this.missingStoreIdResponse(action);

        try {
          await this.platformStoresService.suspendStore(
            storeId,
            actorId,
            this.assistantActionReason,
          );
        } catch (error) {
          return this.storeActionErrorResponse(action, storeId, error);
        }

        return {
          action,
          storeId,
          message: `Store ${storeId} was suspended successfully.`,
        };
      }

      case PlatformAssistantAction.REACTIVATE_STORE: {
        const storeId = this.extractStoreId(command);
        if (!storeId) return this.missingStoreIdResponse(action);

        try {
          await this.platformStoresService.reactivateStore(
            storeId,
            actorId,
            this.assistantActionReason,
          );
        } catch (error) {
          return this.storeActionErrorResponse(action, storeId, error);
        }

        return {
          action,
          storeId,
          message: `Store ${storeId} was reactivated successfully.`,
        };
      }

      case PlatformAssistantAction.SOME_OTHER_ACTION:
      default:
        return {
          action,
          message:
            'Sorry you cannot do this action, please contact support or try a different command.',
        };
    }
  }

  private extractEmail(command: string): string | undefined {
    return command.match(EMAIL_PATTERN)?.[0];
  }

  private extractSessionId(command: string): string | undefined {
    return command.match(UUIDV7_PATTERN)?.[0];
  }

  private extractStoreId(command: string): string | undefined {
    return command.match(UUIDV7_PATTERN)?.[0];
  }

  private missingEmailResponse(action: PlatformAssistantAction) {
    return {
      action,
      message: 'You should provide valid email in command to do this action.',
    };
  }

  private userNotFoundResponse(action: PlatformAssistantAction, email: string) {
    return {
      action,
      email,
      message: 'No user was found with the provided email.',
    };
  }

  private missingStoreIdResponse(action: PlatformAssistantAction) {
    return {
      action,
      message: 'You should provide a store UUIDv7 ID to do this action.',
    };
  }

  private storeActionErrorResponse(
    action: PlatformAssistantAction,
    storeId: string,
    error: unknown,
  ) {
    return {
      action,
      storeId,
      message:
        error instanceof HttpException
          ? error.message
          : 'The store action could not be completed. Please try again.',
    };
  }

  private readonly assistantActionReason =
    'Action performed by the ai assistant';
}
