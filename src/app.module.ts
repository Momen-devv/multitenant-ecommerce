import { Module } from '@nestjs/common';
import { DatabaseModule, LoggerModule } from '@/infrastructure';
import { CoreModule } from '@/core/core.module';

@Module({
  imports: [CoreModule, DatabaseModule, LoggerModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
