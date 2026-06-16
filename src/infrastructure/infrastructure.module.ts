import { Module } from '@nestjs/common';
import { RedisModule } from './redis/redis.module';
import { LoggerModule } from './logger/logger.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [DatabaseModule, LoggerModule, RedisModule],
  controllers: [],
  providers: [],
})
export class InfrastructureModule {}
