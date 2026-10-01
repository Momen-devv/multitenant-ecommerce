import { Module } from '@nestjs/common';
import { ActiveStoreGuard } from '@/common/guards/active-store.guard';
import { AiModule } from '@/infrastructure/ai/ai.module';
import { StoresModule } from '@/modules/stores/stores.module';
import { CommentsController } from './controllers/comments.controller';
import { StoreCommentsController } from './controllers/store-comments.controller';
import { CommentsRepository } from './repos/comments.repository';
import { StoreCommentsRepository } from './repos/store-comments.repository';
import { CommentsService } from './services/comments.service';
import { StoreCommentsService } from './services/store-comments.service';
import {
  COMMENTS_REPOSITORY,
  STORE_COMMENTS_REPOSITORY,
} from './interfaces/repos';

@Module({
  imports: [AiModule, StoresModule],
  controllers: [CommentsController, StoreCommentsController],
  providers: [
    CommentsRepository,
    { provide: COMMENTS_REPOSITORY, useExisting: CommentsRepository },
    StoreCommentsRepository,
    {
      provide: STORE_COMMENTS_REPOSITORY,
      useExisting: StoreCommentsRepository,
    },
    CommentsService,
    StoreCommentsService,
    ActiveStoreGuard,
  ],
})
export class CommentsModule {}
