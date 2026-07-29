import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  appConfig,
  databaseConfig,
  mailConfig,
  redisConfig,
  storageConfig,
  validate,
} from '@/core/config';
import { RestrictInternalFieldsHook } from './auth/hooks/restrict-internal-fields.hook';
import { CheckActivationHook } from './auth/hooks/check-activation-hook';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validate,
      load: [databaseConfig, appConfig, redisConfig, mailConfig, storageConfig],
    }),
  ],
  providers: [RestrictInternalFieldsHook, CheckActivationHook],
})
export class CoreModule {}
