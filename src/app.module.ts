import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { ConfigModule } from '@nestjs/config';
import { validate } from '@/config/env.validation';
import { LoggerModule } from '@/logger/logger.module';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validate,
    }),
    LoggerModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
