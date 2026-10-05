import { Module } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { InfrastructureModule } from '@/infrastructure/infrastructure.module';
import { CoreModule } from '@/core/core.module';
import { EmailQueueService } from '@/infrastructure/queue/email/email-queue.service';
import { SmsQueueService } from '@/infrastructure/queue/sms/sms-queue.service';
import { CACHE_CLIENT } from '@/infrastructure/cache/cache.constants';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import type { Redis } from 'ioredis';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as Schema from '@/infrastructure/database/schema/schema';
import type { ConfigType } from '@nestjs/config';
import { betterAuthConfig } from '@/core/config';
import { createAuth } from './config/auth';
import { assertInvitationCaptureInstalled } from '@/modules/notifications/services/invitation-notification-capture';
import { AuthenticationController } from './controllers/authentication.controller';
import { PasswordController } from './controllers/password.controller';
import { EmailController } from './controllers/email.controller';
import { SessionController } from './controllers/session.controller';
import { AccountController } from './controllers/account.controller';
import { AuthenticationService } from './services/authentication.service';
import { PasswordService } from './services/password.service';
import { EmailService } from './services/email.service';
import { SessionService } from './services/session.service';
import { AccountService } from './services/account.service';
import { CheckActivationHook } from './hooks/check-activation-hook';
import { RestrictInternalFieldsHook } from './hooks/restrict-internal-fields.hook';

@Module({
  imports: [
    CoreModule,
    BetterAuthModule.forRootAsync({
      disableGlobalAuthGuard: true,
      imports: [InfrastructureModule],
      inject: [
        EmailQueueService,
        SmsQueueService,
        CACHE_CLIENT,
        DATABASE,
        betterAuthConfig.KEY,
      ],
      useFactory: async (
        emailQueue: EmailQueueService,
        smsQueue: SmsQueueService,
        redis: Redis,
        database: NodePgDatabase<typeof Schema>,
        configuration: ConfigType<typeof betterAuthConfig>,
      ) => {
        await assertInvitationCaptureInstalled(database);
        return {
          auth: createAuth({
            emailQueue,
            smsQueue,
            redis,
            database,
            configuration,
          }),
          bodyParser: { rawBody: true },
        };
      },
    }),
  ],
  controllers: [
    AuthenticationController,
    PasswordController,
    EmailController,
    SessionController,
    AccountController,
  ],
  providers: [
    CheckActivationHook,
    RestrictInternalFieldsHook,
    AuthenticationService,
    PasswordService,
    EmailService,
    SessionService,
    AccountService,
  ],
  exports: [
    AuthenticationService,
    PasswordService,
    EmailService,
    SessionService,
    AccountService,
    BetterAuthModule,
  ],
})
export class AuthModule {}
