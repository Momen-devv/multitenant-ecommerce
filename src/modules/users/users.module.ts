import { Module } from '@nestjs/common';
import { UsersService } from './services/users.service';
import { UsersController } from './controllers/users.controller';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { UserRepository } from './repos/user.repository';
import { CommonModule } from '@/common/common.module';
import { AccountController } from './controllers/account.controller';
import { AccountService } from './services/account.service';
import { AccountRepository } from './repos';
import { AccountCleanupTask } from './tasks/account-cleanup.task';
@Module({
  imports: [StorageModule, CommonModule],
  providers: [
    UsersService,
    AccountService,
    UserRepository,
    AccountRepository,
    AccountCleanupTask,
  ],
  controllers: [UsersController, AccountController],
})
export class UsersModule {}
