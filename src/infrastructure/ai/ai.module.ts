import { Module } from '@nestjs/common';
import { typesafeClientProvider } from './providers/typesafe-client.provider';
import { AiService } from '@/common/abstracts';
import { TypeSafeAiService } from './typesafe-ai.service';

@Module({
  providers: [
    typesafeClientProvider,
    { provide: AiService, useClass: TypeSafeAiService },
  ],
  exports: [AiService],
})
export class AiModule {}
