import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './indicators/redis.indicator';
import { DrizzleHealthIndicator } from './indicators/drizzle.indicator';
import { BullMqHealthIndicator } from './indicators/bullmq.indicator';

@Module({
  imports: [TerminusModule, HttpModule],
  controllers: [HealthController],
  providers: [
    RedisHealthIndicator,
    DrizzleHealthIndicator,
    BullMqHealthIndicator,
  ],
})
export class HealthModule {}
