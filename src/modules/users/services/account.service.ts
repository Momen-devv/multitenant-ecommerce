import { CACHE_SERVICE } from '@/common/constants/injection-tokens.constants';
import type { Auth } from '@/core/auth/auth';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { EmailQueueService } from '@/infrastructure/queue/email/email-queue.service';
import type { ICacheService } from '@/infrastructure/redis/redis.interface';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { AccountRepository } from '../repos';
import type { ConfigType } from '@nestjs/config';
import appConfig from '@/core/config/app.config';
import { SecureTokenService } from '@/common/services/secure-token.service';

// The reactivation token is valid for 15 minutes
const REACTIVATION_TOKEN_TTL_SECONDS = 60 * 15;
const ACCOUNT_REACTIVATION_TOKEN_PREFIX = 'account-reactivation';

@Injectable()
export class AccountService {
  constructor(
    @Inject(CACHE_SERVICE) private readonly cacheService: ICacheService,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    private readonly authService: AuthService<Auth>,
    private readonly logger: LoggerService,
    private readonly emailQueue: EmailQueueService,
    private readonly accountRepository: AccountRepository,
    private readonly secureToken: SecureTokenService,
  ) {}

  async deactivateAccount(
    userId: string,
    email: string,
    headers: Record<string, string>,
  ) {
    await this.deactivateAndRevokeSessions(headers);

    await this.emailQueue
      .addAccountDeactivatedJob(email)
      .catch((error) =>
        this.logger.error(
          'Failed to enqueue deactivation notice email',
          error,
          AccountService.name,
        ),
      );

    this.logger.log('Account deactivated', AccountService.name, {
      userId,
    });
  }

  async requestReactivation(email: string) {
    const user = await this.accountRepository.findByEmail(email);

    if (!user || user.isActive) {
      return;
    }

    const { token, hashedToken } = this.secureToken.generate();

    await this.cacheService.setex(
      `${ACCOUNT_REACTIVATION_TOKEN_PREFIX}:${user.id}`,
      REACTIVATION_TOKEN_TTL_SECONDS,
      hashedToken,
    );

    const reactivationUrl = `${this.config.baseUrl}/api/v1/users/account/reactivate/confirm?token=${token}&userId=${user.id}`;

    await this.emailQueue
      .addAccountReactivationJob(email, reactivationUrl)
      .catch((error) =>
        this.logger.error(
          'Failed to enqueue reactivation email',
          error,
          AccountService.name,
        ),
      );
  }

  async confirmReactivation(token: string, userId: string) {
    const key = `${ACCOUNT_REACTIVATION_TOKEN_PREFIX}:${userId}`;

    const cachedHashedToken = await this.cacheService.get(key);

    if (
      !cachedHashedToken ||
      !this.secureToken.verify(token, cachedHashedToken)
    ) {
      throw new BadRequestException('Invalid or expired reactivation token');
    }

    await this.accountRepository.updateUser(userId, {
      isActive: true,
      deactivatedAt: null,
    });

    await this.cacheService.del(key);

    this.logger.log('Account reactivated', AccountService.name, { userId });
  }

  private async deactivateAndRevokeSessions(headers: Record<string, string>) {
    await this.authService.api.updateUser({
      body: { isActive: false, deactivatedAt: new Date() },
      headers: fromNodeHeaders(headers),
    });

    try {
      await this.authService.api.revokeSessions({
        headers: fromNodeHeaders(headers),
      });
    } catch (error) {
      await this.authService.api
        .updateUser({
          body: { isActive: true, deactivatedAt: null },
          headers: fromNodeHeaders(headers),
        })
        .catch((rollbackError) =>
          this.logger.error(
            'Failed to rollback isActive after revokeSessions failure',
            rollbackError,
            AccountService.name,
          ),
        );
      throw error;
    }
  }
}
