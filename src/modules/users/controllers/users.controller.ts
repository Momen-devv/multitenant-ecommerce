import {
  Body,
  Controller,
  Delete,
  Patch,
  Headers,
  Post,
  Session,
  UploadedFile,
  UseInterceptors,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from '../services/users.service';
import { UpdateProfileDto } from '../dto';
import {
  imageUploadOptions,
  MAX_PROFILE_IMAGE_SIZE,
} from '@/infrastructure/storage/multer.config';
import type { CurrentUser } from '@/core/auth/auth.types';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { createImageFileValidator } from '@/infrastructure/storage/file-validation.config';

@Controller('profile')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ResponseMessage('Profile updated successfully')
  @HttpCode(HttpStatus.OK)
  @Patch()
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @Headers() headers: Record<string, string>,
  ) {
    await this.usersService.updateProfile(dto, headers);
  }

  @ResponseMessage('Profile image uploaded successfully')
  @UseInterceptors(FileInterceptor('profileImage', imageUploadOptions))
  @HttpCode(HttpStatus.OK)
  @Post('image')
  async uploadProfileImage(
    @UploadedFile(createImageFileValidator({ maxSize: MAX_PROFILE_IMAGE_SIZE }))
    profileImage: Express.Multer.File,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    await this.usersService.uploadProfileImage(
      profileImage,
      session.user.imageKey ?? null,
      session.user.id,
      headers,
    );
  }

  @Delete('image')
  deleteProfileImage() {}

  @Post('activate')
  activateAccount() {}

  @Post('deactivate')
  deactivateAccount() {}
}
