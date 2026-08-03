import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { StorageService } from '@/common/abstracts/storage.abstracts';
import { ImageProcessingService } from '@/common/services/Image-processing.service';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { ResourceCleanupQueueService } from '@/infrastructure/queue/resource-cleanup/resource-cleanup-queue.service';
import { UserRepository } from '../repos';
import { UpdateProfileDto } from '../dto';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: jest.fn(),
}));
jest.mock('better-auth/node', (): { fromNodeHeaders: jest.Mock } => ({
  fromNodeHeaders: jest.fn(
    (headers: Record<string, string>) => new Headers(headers),
  ),
}));
jest.mock('node:crypto', () => ({
  ...jest.requireActual('node:crypto'),
  randomUUID: jest.fn(() => 'fixed-uuid'),
}));
jest.mock('@/common/services/Image-processing.service', () => ({
  ImageProcessingService: jest.fn(),
}));

describe('UsersService', () => {
  let usersService: UsersService;
  let authService: { api: { updateUser: jest.Mock } };
  let storage: { uploadFile: jest.Mock };
  let imageProcessingService: { validateAndSanitize: jest.Mock };
  let logger: { log: jest.Mock; error: jest.Mock };
  let resourceCleanupQueue: {
    addDeleteOrphanedFileJob: jest.Mock;
    addDeleteOldFileJob: jest.Mock;
  };

  beforeEach(async () => {
    authService = { api: { updateUser: jest.fn() } };
    storage = { uploadFile: jest.fn() };
    imageProcessingService = { validateAndSanitize: jest.fn() };
    logger = { log: jest.fn(), error: jest.fn() };
    resourceCleanupQueue = {
      addDeleteOrphanedFileJob: jest.fn(),
      addDeleteOldFileJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: AuthService, useValue: authService },
        { provide: StorageService, useValue: storage },
        { provide: ImageProcessingService, useValue: imageProcessingService },
        { provide: LoggerService, useValue: logger },
        {
          provide: ResourceCleanupQueueService,
          useValue: resourceCleanupQueue,
        },
        { provide: UserRepository, useValue: {} },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(usersService).toBeDefined();
  });

  describe('updateProfile', () => {
    it('should call authService.api.updateUser with correct parameters and headers', async () => {
      const dto: UpdateProfileDto = { name: 'Ahmed' };

      const headers = { authorization: 'Bearer token123' };

      authService.api.updateUser.mockResolvedValue(undefined);

      await usersService.updateProfile(dto, headers);

      expect(authService.api.updateUser).toHaveBeenCalledTimes(1);
      expect(authService.api.updateUser).toHaveBeenCalledWith({
        body: { name: dto.name },
        headers: expect.any(Headers),
      });
    });

    it('should propagate the error if authService.api.updateUser throws', async () => {
      const dto: UpdateProfileDto = { name: 'Ahmed' };
      const headers = { authorization: 'Bearer token123' };
      const error = new Error('Update failed');

      authService.api.updateUser.mockRejectedValue(error);

      await expect(usersService.updateProfile(dto, headers)).rejects.toThrow(
        'Update failed',
      );
    });
  });

  describe('uploadProfileImage', () => {
    const profileImage = {
      buffer: Buffer.from('fake-image'),
      originalname: 'photo.png',
    } as Express.Multer.File;
    const userId = 'user-123';
    const headers = { authorization: 'Bearer token123' };
    const uploadedUrl = 'https://cdn.example.com/profile-images/fixed-uuid.png';

    beforeEach(() => {
      imageProcessingService.validateAndSanitize.mockResolvedValue({
        buffer: Buffer.from('sanitized'),
        mimetype: 'image/png',
      });
      storage.uploadFile.mockResolvedValue(uploadedUrl);
    });

    describe('happy path', () => {
      it('should upload the image, update the user, and delete the old file when imageKey exists', async () => {
        const oldImageKey = 'profile-images/old-file.png';
        authService.api.updateUser.mockResolvedValue(undefined);
        resourceCleanupQueue.addDeleteOldFileJob.mockResolvedValue(undefined);

        await usersService.uploadProfileImage(
          profileImage,
          oldImageKey,
          userId,
          headers,
        );

        expect(imageProcessingService.validateAndSanitize).toHaveBeenCalledWith(
          profileImage,
        );
        expect(storage.uploadFile).toHaveBeenCalledWith(
          { buffer: Buffer.from('sanitized'), mimetype: 'image/png' },
          'profile-images/fixed-uuid.png',
        );
        expect(authService.api.updateUser).toHaveBeenCalledWith({
          body: {
            image: uploadedUrl,
            imageKey: 'profile-images/fixed-uuid.png',
          },
          headers: expect.any(Headers),
        });
        expect(resourceCleanupQueue.addDeleteOldFileJob).toHaveBeenCalledWith(
          oldImageKey,
        );
        expect(logger.log).toHaveBeenCalledWith(
          'Profile image updated',
          UsersService.name,
          { userId },
        );
      });

      it('should NOT call addDeleteOldFileJob when imageKey is null', async () => {
        authService.api.updateUser.mockResolvedValue(undefined);

        await usersService.uploadProfileImage(
          profileImage,
          null,
          userId,
          headers,
        );

        expect(resourceCleanupQueue.addDeleteOldFileJob).not.toHaveBeenCalled();
        expect(logger.log).toHaveBeenCalledWith(
          'Profile image updated',
          UsersService.name,
          { userId },
        );
      });
    });

    describe('when validateAndSanitize fails', () => {
      it('should propagate the error and never call storage.uploadFile', async () => {
        const error = new Error('Invalid image');
        imageProcessingService.validateAndSanitize.mockRejectedValue(error);

        await expect(
          usersService.uploadProfileImage(profileImage, null, userId, headers),
        ).rejects.toThrow('Invalid image');

        expect(storage.uploadFile).not.toHaveBeenCalled();
        expect(authService.api.updateUser).not.toHaveBeenCalled();
      });
    });

    describe('when storage.uploadFile fails', () => {
      it('should propagate the error and never call authService.api.updateUser', async () => {
        const error = new Error('Upload failed');
        storage.uploadFile.mockRejectedValue(error);

        await expect(
          usersService.uploadProfileImage(profileImage, null, userId, headers),
        ).rejects.toThrow('Upload failed');

        expect(authService.api.updateUser).not.toHaveBeenCalled();
      });
    });

    describe('when authService.api.updateUser fails', () => {
      it('should log the error, enqueue orphaned file cleanup, and rethrow', async () => {
        const error = new Error('updateUser failed');
        authService.api.updateUser.mockRejectedValue(error);
        resourceCleanupQueue.addDeleteOrphanedFileJob.mockResolvedValue(
          undefined,
        );

        await expect(
          usersService.uploadProfileImage(profileImage, null, userId, headers),
        ).rejects.toThrow('updateUser failed');

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to update user profile image',
          error,
          UsersService.name,
        );
        expect(
          resourceCleanupQueue.addDeleteOrphanedFileJob,
        ).toHaveBeenCalledWith('profile-images/fixed-uuid.png');
      });

      it('should still rethrow the original error even if enqueueing cleanup itself fails', async () => {
        const originalError = new Error('updateUser failed');
        const enqueueError = new Error('queue is down');
        authService.api.updateUser.mockRejectedValue(originalError);
        resourceCleanupQueue.addDeleteOrphanedFileJob.mockRejectedValue(
          enqueueError,
        );

        await expect(
          usersService.uploadProfileImage(profileImage, null, userId, headers),
        ).rejects.toThrow('updateUser failed');

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to update user profile image',
          originalError,
          UsersService.name,
        );
        expect(logger.error).toHaveBeenCalledWith(
          `Failed to enqueue orphaned file cleanup for "profile-images/fixed-uuid.png"`,
          enqueueError,
          UsersService.name,
        );
      });
    });

    describe('when addDeleteOldFileJob fails to enqueue', () => {
      it('should log the error but NOT throw (the whole operation still succeeds)', async () => {
        const oldImageKey = 'profile-images/old-file.png';
        const enqueueError = new Error('queue is down');
        authService.api.updateUser.mockResolvedValue(undefined);
        resourceCleanupQueue.addDeleteOldFileJob.mockRejectedValue(
          enqueueError,
        );

        await expect(
          usersService.uploadProfileImage(
            profileImage,
            oldImageKey,
            userId,
            headers,
          ),
        ).resolves.toBeUndefined();

        expect(logger.error).toHaveBeenCalledWith(
          `Failed to enqueue old file cleanup for "${oldImageKey}"`,
          enqueueError,
          UsersService.name,
        );

        expect(logger.log).toHaveBeenCalledWith(
          'Profile image updated',
          UsersService.name,
          { userId },
        );
      });
    });
  });

  describe('deleteProfileImage', () => {
    const userId = 'user-123';
    const headers = { authorization: 'Bearer token123' };

    describe('when imageKey is null', () => {
      it('should return immediately without calling any dependency', async () => {
        await usersService.deleteProfileImage(null, userId, headers);

        expect(authService.api.updateUser).not.toHaveBeenCalled();
        expect(resourceCleanupQueue.addDeleteOldFileJob).not.toHaveBeenCalled();
        expect(logger.log).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
      });
    });

    describe('when imageKey is provided', () => {
      const imageKey = 'profile-images/old-file.png';

      describe('happy path', () => {
        it('should update the user, enqueue old file cleanup, and log success', async () => {
          authService.api.updateUser.mockResolvedValue(undefined);
          resourceCleanupQueue.addDeleteOldFileJob.mockResolvedValue(undefined);

          await usersService.deleteProfileImage(imageKey, userId, headers);

          expect(authService.api.updateUser).toHaveBeenCalledWith({
            body: { image: null, imageKey: null },
            headers: expect.any(Headers),
          });
          expect(resourceCleanupQueue.addDeleteOldFileJob).toHaveBeenCalledWith(
            imageKey,
          );
          expect(logger.log).toHaveBeenCalledWith(
            'Profile image deleted',
            UsersService.name,
            { userId },
          );
        });
      });

      describe('when authService.api.updateUser fails', () => {
        it('should log the error, rethrow, and never enqueue old file cleanup', async () => {
          const error = new Error('updateUser failed');
          authService.api.updateUser.mockRejectedValue(error);

          await expect(
            usersService.deleteProfileImage(imageKey, userId, headers),
          ).rejects.toThrow('updateUser failed');

          expect(logger.error).toHaveBeenCalledWith(
            'Failed to update user profile image',
            error,
            UsersService.name,
          );
          expect(
            resourceCleanupQueue.addDeleteOldFileJob,
          ).not.toHaveBeenCalled();
          expect(logger.log).not.toHaveBeenCalled();
        });
      });

      describe('when addDeleteOldFileJob fails to enqueue', () => {
        it('should log the enqueue error but still resolve successfully', async () => {
          const enqueueError = new Error('queue is down');
          authService.api.updateUser.mockResolvedValue(undefined);
          resourceCleanupQueue.addDeleteOldFileJob.mockRejectedValue(
            enqueueError,
          );

          await expect(
            usersService.deleteProfileImage(imageKey, userId, headers),
          ).resolves.toBeUndefined();

          expect(logger.error).toHaveBeenCalledWith(
            `Failed to enqueue old file cleanup for "${imageKey}"`,
            enqueueError,
            UsersService.name,
          );
          expect(logger.log).toHaveBeenCalledWith(
            'Profile image deleted',
            UsersService.name,
            { userId },
          );
        });
      });
    });
  });
});
