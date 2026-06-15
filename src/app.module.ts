import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';
import { validate } from '@/config/env.validation';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validate,
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
