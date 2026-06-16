import { Module } from '@nestjs/common';
import { CoreModule } from '@/core/core.module';
import { InfrastructureModule } from '@/infrastructure/infrastructure.module';

@Module({
  imports: [CoreModule, InfrastructureModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
