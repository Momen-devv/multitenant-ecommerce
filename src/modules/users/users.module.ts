import { Module } from '@nestjs/common';
import { UsersService } from './services/users.service';
import { UsersController } from './controllers/users.controller';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { UserRepository } from './repos/user.repository';
import { AccountController } from './controllers/account.controller';
import { AccountService } from './services/account.service';
import { AccountRepository } from './repos';
import { ACCOUNT_REPOSITORY, USER_REPOSITORY } from './interfaces/repos';
import { AccountCleanupTask } from './tasks/account-cleanup.task';
import { ImageProcessingService } from '@/common/services/Image-processing.service';
import { SecureTokenService } from '@/common/services/secure-token.service';
import { PlatformUsersController } from './controllers/platform-users.controller';
import { PlatformImpersonationController } from './controllers/platform-impersonation.controller';
import { PlatformUsersService } from './services/platform-users.service';
import { PlatformImpersonationService } from './services/platform-impersonation.service';
import { PhoneController } from './controllers/phone.controller';
import { PhoneService } from './services/phone.service';
import { AddressesController } from './controllers/addresses.controller';
import { AddressesService } from './services/addresses.service';
import { UserAddressesRepository } from './repos/user-addresses.repository';
import { USER_ADDRESSES_REPOSITORY } from './interfaces/repos';
@Module({
  imports: [StorageModule],
  providers: [
    UsersService,
    AccountService,
    UserRepository,
    AccountRepository,
    { provide: USER_REPOSITORY, useExisting: UserRepository },
    { provide: ACCOUNT_REPOSITORY, useExisting: AccountRepository },
    AccountCleanupTask,
    ImageProcessingService,
    SecureTokenService,
    PlatformUsersService,
    PlatformImpersonationService,
    PhoneService,
    AddressesService,
    UserAddressesRepository,
    {
      provide: USER_ADDRESSES_REPOSITORY,
      useExisting: UserAddressesRepository,
    },
  ],
  controllers: [
    UsersController,
    AccountController,
    PlatformUsersController,
    PlatformImpersonationController,
    PhoneController,
    AddressesController,
  ],
})
export class UsersModule {}
