import { Injectable } from '@nestjs/common';
import { UpdateProfileDto } from '../dto';
import { StorageService } from '@/common/abstracts/storage.abstracts';
import { ImageProcessingService } from '../../../common/services/Image-processing.service';
import { randomUUID } from 'node:crypto';
import { UserRepository } from '../repos/user.repository';
import auth from '@/core/auth/auth';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { ResourceCleanupQueueService } from '@/infrastructure/queue/resource-cleanup/resource-cleanup-queue.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly authService: AuthService<typeof auth>,
    private readonly storage: StorageService,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly userRepository: UserRepository,
    private readonly logger: LoggerService,
    private readonly resourceCleanupQueue: ResourceCleanupQueueService,
  ) {}

  async updateProfile(dto: UpdateProfileDto, headers: Record<string, string>) {
    await this.authService.api.updateUser({
      body: { name: dto.name },
      headers: fromNodeHeaders(headers),
    });
  }
  async uploadProfileImage(
    profileImage: Express.Multer.File,
    imageKey: string | null,
    userId: string,
    headers: Record<string, string>,
  ) {
    const sanitizedImage =
      await this.imageProcessingService.validateAndSanitize(profileImage);
    const filePath = `profile-images/${randomUUID()}.${sanitizedImage.mimetype.split('/')[1]}`;

    const url = await this.storage.uploadFile(sanitizedImage, filePath);

    try {
      await this.authService.api.updateUser({
        body: { image: url, imageKey: filePath },
        headers: fromNodeHeaders(headers),
      });
    } catch (error) {
      this.logger.error(
        'Failed to update user profile image',
        error,
        UsersService.name,
      );

      await this.resourceCleanupQueue
        .addDeleteOrphanedFileJob(filePath)
        .catch((enqueueError) =>
          this.logger.error(
            `Failed to enqueue orphaned file cleanup for "${filePath}"`,
            enqueueError,
            UsersService.name,
          ),
        );

      throw error;
    }

    if (imageKey) {
      await this.resourceCleanupQueue
        .addDeleteOldFileJob(imageKey)
        .catch((enqueueError) =>
          this.logger.error(
            `Failed to enqueue old file cleanup for "${imageKey}"`,
            enqueueError,
            UsersService.name,
          ),
        );
    }
    this.logger.log('Profile image updated', UsersService.name, { userId });
  }
}
