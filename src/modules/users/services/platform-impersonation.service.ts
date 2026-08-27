import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { isAPIError } from 'better-auth/api';
import type { Auth } from '@/core/auth/auth';
import { AuthRole } from '@/common/enums';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { UserRepository } from '../repos';

type NodeHeaders = Record<string, string>;

@Injectable()
export class PlatformImpersonationService {
  constructor(
    private readonly authService: AuthService<Auth>,
    private readonly userRepository: UserRepository,
    private readonly logger: LoggerService,
  ) {}

  async startImpersonation(
    targetUserId: string,
    reason: string,
    actorId: string,
    headers: NodeHeaders,
  ) {
    const target = await this.userRepository.findById(targetUserId);
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (targetUserId === actorId) {
      throw new BadRequestException('You cannot impersonate yourself');
    }
    if (this.hasRole(target.role, AuthRole.PLATFORM_SUPER_ADMIN)) {
      throw new ForbiddenException(
        'Platform super-admin accounts cannot be impersonated',
      );
    }

    const result = await this.callAuth(() =>
      this.authService.api.impersonateUser({
        body: { userId: targetUserId },
        headers: fromNodeHeaders(headers),
        returnHeaders: true,
      }),
    );

    this.audit('platform_user.impersonated', actorId, targetUserId, reason, {
      ipAddress: this.getIpAddress(headers),
    });

    return {
      headers: result.headers,
      data: {
        user: result.response.user,
        session: this.withoutSessionToken(result.response.session),
      },
    };
  }

  async stopImpersonation(impersonatedUserId: string, headers: NodeHeaders) {
    const result = await this.callAuth(() =>
      this.authService.api.stopImpersonating({
        headers: fromNodeHeaders(headers),
        returnHeaders: true,
      }),
    );

    this.audit(
      'platform_user.impersonation_stopped',
      result.response.user.id,
      impersonatedUserId,
      'Impersonation session ended',
      { ipAddress: this.getIpAddress(headers) },
    );

    return {
      headers: result.headers,
      data: {
        user: result.response.user,
        session: this.withoutSessionToken(result.response.session),
      },
    };
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
    this.logger.log(action, PlatformImpersonationService.name, {
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
