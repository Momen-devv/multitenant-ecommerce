import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  appConfig,
  betterAuthConfig,
  databaseConfig,
  mailConfig,
  redisConfig,
  smsConfig,
  storageConfig,
  stripeConfig,
  typesafeConfig,
  notificationConfig,
  validate,
} from '@/core/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validate,
      load: [
        databaseConfig,
        appConfig,
        redisConfig,
        mailConfig,
        smsConfig,
        storageConfig,
        betterAuthConfig,
        stripeConfig,
        typesafeConfig,
        notificationConfig,
      ],
    }),
  ],
})
export class CoreModule {}
