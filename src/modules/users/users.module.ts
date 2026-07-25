import { Module } from '@nestjs/common';
import { UsersService } from './services/users.service';
import { UsersController } from './controllers/users.controller';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { UserRepository } from './repos/user.repository';
import { CommonModule } from '@/common/common.module';
@Module({
  imports: [StorageModule, CommonModule],
  providers: [UsersService, UserRepository],
  controllers: [UsersController],
})
export class UsersModule {}
