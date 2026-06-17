import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  appConfig,
  databaseConfig,
  redisConfig,
  validate,
} from '@/core/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validate,
      load: [databaseConfig, appConfig, redisConfig],
    }),
  ],
})
export class CoreModule {}
