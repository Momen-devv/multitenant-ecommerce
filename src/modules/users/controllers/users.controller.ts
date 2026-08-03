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
import { seconds, Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiSuccessResponse } from '@/common/decorators/api-success-response.decorator';
import { ApiErrorResponse } from '@/common/decorators/api-error-response.decorator';

@ApiTags('Profile')
@ApiCookieAuth()
@Controller('profile')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({
    summary: 'Update the current user profile',
    description:
      'Updates profile fields (e.g. name) for the currently authenticated user.',
  })
  @ApiSuccessResponse({ description: 'Profile updated successfully' })
  @ApiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    'Unauthorized. The user must be authenticated to update their profile.',
  )
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Validation failed. One or more fields are invalid.',
  )
  @ApiErrorResponse(
    HttpStatus.TOO_MANY_REQUESTS,
    'Too many requests. Rate limit exceeded (10 requests / 60s).',
  )
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ResponseMessage('Profile updated successfully')
  @HttpCode(HttpStatus.OK)
  @Patch()
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @Headers() headers: Record<string, string>,
  ) {
    await this.usersService.updateProfile(dto, headers);
  }

  @ApiOperation({
    summary: 'Upload a profile image',
    description:
      'Uploads and sets a new profile image for the currently authenticated user, replacing any existing one.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        profileImage: {
          type: 'string',
          format: 'binary',
          description: `Image file (max size: ${MAX_PROFILE_IMAGE_SIZE} bytes)`,
        },
      },
      required: ['profileImage'],
    },
  })
  @ApiSuccessResponse({ description: 'Profile image uploaded successfully' })
  @ApiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    'Unauthorized. The user must be authenticated to upload a profile image.',
  )
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Invalid file. Missing file, unsupported file type, or file exceeds the maximum allowed size.',
  )
  @ApiErrorResponse(
    HttpStatus.TOO_MANY_REQUESTS,
    'Too many requests. Rate limit exceeded (5 requests / 60s).',
  )
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
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

  @ApiOperation({
    summary: 'Delete the current profile image',
    description:
      'Removes the profile image of the currently authenticated user, if one exists.',
  })
  @ApiSuccessResponse({ description: 'Profile image deleted successfully' })
  @ApiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    'Unauthorized. The user must be authenticated to delete their profile image.',
  )
  @ApiErrorResponse(
    HttpStatus.TOO_MANY_REQUESTS,
    'Too many requests. Rate limit exceeded (5 requests / 60s).',
  )
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ResponseMessage('Profile image deleted successfully')
  @HttpCode(HttpStatus.OK)
  @Delete('image')
  async deleteProfileImage(
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    await this.usersService.deleteProfileImage(
      session.user.imageKey ?? null,
      session.user.id,
      headers,
    );
  }
}
