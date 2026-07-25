import { Module } from '@nestjs/common';
import { UsersService } from './services/users.service';
import { UsersController } from './controllers/users.controller';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { ImageProcessingService } from './services/Image processing.service';
import { UserRepository } from './repos/user.repository';
@Module({
  imports: [StorageModule],
  providers: [UsersService, ImageProcessingService, UserRepository],
  controllers: [UsersController],
})
export class UsersModule {}
