import { Module } from '@nestjs/common';
import { UsersService } from './services/users.service';
import { UsersController } from './controllers/users.controller';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { UserRepository } from './repos/user.repository';
import { AccountController } from './controllers/account.controller';
import { AccountService } from './services/account.service';
import { AccountRepository } from './repos';
import { AccountCleanupTask } from './tasks/account-cleanup.task';
import { ImageProcessingService } from '@/common/services/Image-processing.service';
import { SecureTokenService } from '@/common/services/secure-token.service';
@Module({
  imports: [StorageModule],
  providers: [
    UsersService,
    AccountService,
    UserRepository,
    AccountRepository,
    AccountCleanupTask,
    ImageProcessingService,
    SecureTokenService,
  ],
  controllers: [UsersController, AccountController],
})
export class UsersModule {}
