import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { isAPIError } from 'better-auth/api';
import type { Auth } from '@/core/auth/auth';
import { AuthRole } from '@/common/enums';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { USER_REPOSITORY, type IUserRepository } from '../interfaces/repos';
import type {
  BanPlatformUserDto,
  CreatePlatformUserDto,
  ListPlatformUsersDto,
  PlatformUserReasonDto,
  SetPlatformUserRoleDto,
  UpdatePlatformUserDto,
} from '../dto';

type NodeHeaders = Record<string, string>;

@Injectable()
export class PlatformUsersService {
  constructor(
    private readonly authService: AuthService<Auth>,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly logger: LoggerService,
  ) {}

  async listUsers(query: ListPlatformUsersDto, headers: NodeHeaders) {
    return this.callAuth(() =>
      this.authService.api.listUsers({
        query: {
          searchValue: query.searchValue,
          searchField: query.searchField,
          searchOperator: 'contains',
          limit: query.limit,
          offset: query.offset,
          sortBy: query.sortBy,
          sortDirection: query.sortDirection,
        },
        headers: fromNodeHeaders(headers),
      }),
    );
  }

  async getUser(userId: string, headers: NodeHeaders) {
    return this.callAuth(() =>
      this.authService.api.getUser({
        query: { id: userId },
        headers: fromNodeHeaders(headers),
      }),
    );
  }

  async createUser(
    dto: CreatePlatformUserDto,
    actorId: string,
    headers: NodeHeaders,
  ) {
    const result = await this.callAuth(() =>
      this.authService.api.createUser({
        body: {
          email: dto.email,
          name: dto.name,
          password: dto.password,
          role: dto.role,
        },
        headers: fromNodeHeaders(headers),
      }),
    );

    this.audit('platform_user.created', actorId, result.user.id, dto.reason, {
      role: dto.role,
      email: dto.email,
      ipAddress: this.getIpAddress(headers),
    });

    return result;
  }

  async updateUser(
    userId: string,
    dto: UpdatePlatformUserDto,
    actorId: string,
    headers: NodeHeaders,
  ) {
    if (dto.name === undefined && dto.email === undefined) {
      throw new BadRequestException('At least one user field must be provided');
    }

    const existing = await this.requireUser(userId);
    const data = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.email !== undefined && { email: dto.email }),
    };
    const result = await this.callAuth(() =>
      this.authService.api.adminUpdateUser({
        body: { userId, data },
        headers: fromNodeHeaders(headers),
      }),
    );

    this.audit('platform_user.updated', actorId, userId, dto.reason, {
      before: { name: existing.name, email: existing.email },
      after: data,
      ipAddress: this.getIpAddress(headers),
    });

    return result;
  }

  async setRole(
    userId: string,
    dto: SetPlatformUserRoleDto,
    actorId: string,
    headers: NodeHeaders,
  ) {
    const existing = await this.requireUser(userId);

    if (userId === actorId && dto.role !== AuthRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException('You cannot remove your own platform role');
    }

    if (
      this.hasRole(existing.role, AuthRole.PLATFORM_SUPER_ADMIN) &&
      dto.role !== AuthRole.PLATFORM_SUPER_ADMIN
    ) {
      await this.ensureAnotherPlatformSuperAdminExists();
    }

    const result = await this.callAuth(() =>
      this.authService.api.setRole({
        body: { userId, role: dto.role },
        headers: fromNodeHeaders(headers),
      }),
    );

    this.audit('platform_user.role_changed', actorId, userId, dto.reason, {
      before: { role: existing.role },
      after: { role: dto.role },
      ipAddress: this.getIpAddress(headers),
    });

    return result;
  }

  async banUser(
    userId: string,
    dto: BanPlatformUserDto,
    actorId: string,
    headers: NodeHeaders,
  ) {
    await this.assertCanDisableUser(userId, actorId);

    const result = await this.callAuth(() =>
      this.authService.api.banUser({
        body: {
          userId,
          banReason: dto.reason,
          banExpiresIn: dto.expiresIn,
        },
        headers: fromNodeHeaders(headers),
      }),
    );

    this.audit('platform_user.banned', actorId, userId, dto.reason, {
      expiresIn: dto.expiresIn ?? null,
      ipAddress: this.getIpAddress(headers),
    });

    return result;
  }

  async unbanUser(
    userId: string,
    reason: string,
    actorId: string,
    headers: NodeHeaders,
  ) {
    await this.requireUser(userId);
    const result = await this.callAuth(() =>
      this.authService.api.unbanUser({
        body: { userId },
        headers: fromNodeHeaders(headers),
      }),
    );

    this.audit('platform_user.unbanned', actorId, userId, reason, {
      ipAddress: this.getIpAddress(headers),
    });

    return result;
  }

  async listUserSessions(userId: string, headers: NodeHeaders) {
    await this.requireUser(userId);
    const result = await this.callAuth(() =>
      this.authService.api.listUserSessions({
        body: { userId },
        headers: fromNodeHeaders(headers),
      }),
    );

    return {
      sessions: result.sessions.map((session) =>
        this.withoutSessionToken(session),
      ),
    };
  }

  async revokeUserSession(
    userId: string,
    sessionId: string,
    reason: string,
    actorId: string,
    headers: NodeHeaders,
  ) {
    const sessions = await this.callAuth(() =>
      this.authService.api.listUserSessions({
        body: { userId },
        headers: fromNodeHeaders(headers),
      }),
    );
    const session = sessions.sessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new NotFoundException('User session not found');
    }

    const result = await this.callAuth(() =>
      this.authService.api.revokeUserSession({
        body: { sessionToken: session.token },
        headers: fromNodeHeaders(headers),
      }),
    );

    this.audit('platform_user.session_revoked', actorId, userId, reason, {
      sessionId,
      ipAddress: this.getIpAddress(headers),
    });

    return result;
  }

  async revokeUserSessions(
    userId: string,
    reason: string,
    actorId: string,
    headers: NodeHeaders,
  ) {
    await this.requireUser(userId);
    const result = await this.callAuth(() =>
      this.authService.api.revokeUserSessions({
        body: { userId },
        headers: fromNodeHeaders(headers),
      }),
    );

    this.audit('platform_user.sessions_revoked', actorId, userId, reason, {
      ipAddress: this.getIpAddress(headers),
    });

    return result;
  }

  async deactivateUser(
    userId: string,
    reason: string,
    actorId: string,
    headers: NodeHeaders,
  ) {
    const existing = await this.assertCanDisableUser(userId, actorId);
    if (existing.isActive === false) {
      throw new ConflictException('User is already deactivated');
    }

    await this.callAuth(() =>
      this.authService.api.adminUpdateUser({
        body: {
          userId,
          data: { isActive: false, deactivatedAt: new Date() },
        },
        headers: fromNodeHeaders(headers),
      }),
    );

    try {
      await this.callAuth(() =>
        this.authService.api.revokeUserSessions({
          body: { userId },
          headers: fromNodeHeaders(headers),
        }),
      );
    } catch (error) {
      await this.authService.api
        .adminUpdateUser({
          body: {
            userId,
            data: {
              isActive: existing.isActive,
              deactivatedAt: existing.deactivatedAt,
            },
          },
          headers: fromNodeHeaders(headers),
        })
        .catch((rollbackError) =>
          this.logger.error(
            'Failed to roll back platform user deactivation',
            rollbackError,
            PlatformUsersService.name,
          ),
        );
      throw error;
    }

    this.audit('platform_user.deactivated', actorId, userId, reason, {
      ipAddress: this.getIpAddress(headers),
    });

    return { success: true };
  }

  async reactivateUser(
    userId: string,
    reason: string,
    actorId: string,
    headers: NodeHeaders,
  ) {
    const existing = await this.requireUser(userId);
    if (existing.isActive !== false) {
      throw new ConflictException('User is already active');
    }

    const result = await this.callAuth(() =>
      this.authService.api.adminUpdateUser({
        body: { userId, data: { isActive: true, deactivatedAt: null } },
        headers: fromNodeHeaders(headers),
      }),
    );

    this.audit('platform_user.reactivated', actorId, userId, reason, {
      ipAddress: this.getIpAddress(headers),
    });

    return result;
  }

  async requestPasswordReset(
    userId: string,
    dto: PlatformUserReasonDto,
    actorId: string,
    headers: NodeHeaders,
  ) {
    const user = await this.requireUser(userId);
    const result = await this.callAuth(() =>
      this.authService.api.requestPasswordReset({
        body: { email: user.email },
      }),
    );

    this.audit(
      'platform_user.password_reset_requested',
      actorId,
      userId,
      dto.reason,
      { ipAddress: this.getIpAddress(headers) },
    );

    return result;
  }

  private async assertCanDisableUser(userId: string, actorId: string) {
    if (userId === actorId) {
      throw new ForbiddenException(
        'You cannot disable your own platform account',
      );
    }

    const user = await this.requireUser(userId);
    if (this.hasRole(user.role, AuthRole.PLATFORM_SUPER_ADMIN)) {
      await this.ensureAnotherPlatformSuperAdminExists();
    }
    return user;
  }

  private async ensureAnotherPlatformSuperAdminExists(): Promise<void> {
    if ((await this.userRepository.countPlatformSuperAdmins()) <= 1) {
      throw new ConflictException(
        'The last platform super-admin cannot be disabled or demoted',
      );
    }
  }

  private async requireUser(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private hasRole(role: string | null, expected: AuthRole): boolean {
    return (role ?? '')
      .split(',')
      .map((value) => value.trim())
      .includes(expected);
  }

  private withoutSessionToken<T extends { token: string }>(
    session: T,
  ): Omit<T, 'token'> {
    const safeSession: Partial<T> = { ...session };
    delete safeSession.token;
    return safeSession as Omit<T, 'token'>;
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

  private audit(
    action: string,
    actorId: string,
    targetUserId: string,
    reason: string,
    details: Record<string, unknown>,
  ): void {
    this.logger.log(action, PlatformUsersService.name, {
      actorId,
      targetUserId,
      reason,
      ...details,
    });
  }

  private getIpAddress(headers: NodeHeaders): string | null {
    return (
      headers['cf-connecting-ip'] ??
      headers['x-real-ip'] ??
      headers['x-forwarded-for']?.split(',')[0]?.trim() ??
      null
    );
  }
}
