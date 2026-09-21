import { Module } from '@nestjs/common';
import { typesafeClientProvider } from './providers/typesafe-client.provider';
import { PlatformAssistantController } from './controllers/platform-assistant.controller';
import { StoreAssistantController } from './controllers/store-assistant.controller';
import { AssistantRepository } from './repos/assistant.repository';
import { ASSISTANT_REPOSITORY } from './interfaces/repos';
import { PlatformAssistantService } from './services/platform-assistant.service';
import { PlatformAssistantActionsService } from './services/platform-assistant-actions.service';
import { StoreAssistantService } from './services/store-assistant.service';
import { StoreAssistantActionsService } from './services/store-assistant-actions.service';
import { UsersModule } from '@/modules/users/users.module';
import { StoresModule } from '@/modules/stores/stores.module';

@Module({
  imports: [UsersModule, StoresModule],
  controllers: [PlatformAssistantController, StoreAssistantController],
  providers: [
    typesafeClientProvider,
    PlatformAssistantService,
    PlatformAssistantActionsService,
    StoreAssistantService,
    StoreAssistantActionsService,
    AssistantRepository,
    { provide: ASSISTANT_REPOSITORY, useExisting: AssistantRepository },
  ],
  exports: [ASSISTANT_REPOSITORY],
})
export class AssistantModule {}
