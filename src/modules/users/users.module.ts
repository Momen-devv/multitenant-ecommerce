import { Module } from '@nestjs/common';
import { UsersService } from './services/users.service';
import { UsersController } from './controllers/users.controller';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { UserRepository } from './repos/user.repository';
import { CommonModule } from '@/common/common.module';
import { AccountController } from './controllers/account.controller';
import { AccountService } from './services/account.service';
@Module({
  imports: [StorageModule, CommonModule],
  providers: [UsersService, AccountService, UserRepository],
  controllers: [UsersController, AccountController],
})
export class UsersModule {}
