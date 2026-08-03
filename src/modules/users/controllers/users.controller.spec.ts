import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from '../services/users.service';
import { UpdateProfileDto } from '../dto';
import type { CurrentUser } from '@/core/auth/auth.types';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: jest.fn(),
  AllowAnonymous: jest.fn(() => () => {}),
}));
jest.mock('better-auth/node', (): { fromNodeHeaders: jest.Mock } => ({
  fromNodeHeaders: jest.fn(
    (headers: Record<string, string>) => new Headers(headers),
  ),
}));

jest.mock('@/infrastructure/storage/multer.config', () => ({
  imageUploadOptions: {},
  MAX_PROFILE_IMAGE_SIZE: 5 * 1024 * 1024,
}));

jest.mock('@/infrastructure/storage/file-validation.config', () => ({
  createImageFileValidator: jest.fn(() => ({
    transform: jest.fn((file: Express.Multer.File) => file),
  })),
}));

jest.mock('@/common/services/Image-processing.service', () => ({
  ImageProcessingService: jest.fn(),
}));

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    updateProfile: jest.Mock;
    uploadProfileImage: jest.Mock;
    deleteProfileImage: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      updateProfile: jest.fn(),
      uploadProfileImage: jest.fn(),
      deleteProfileImage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('updateProfile', () => {
    it('should call usersService.updateProfile with the correct dto and headers', async () => {
      const dto: UpdateProfileDto = { name: 'Ahmed' };
      const headers = { authorization: 'Bearer token123' };
      usersService.updateProfile.mockResolvedValue(undefined);

      await controller.updateProfile(dto, headers);

      expect(usersService.updateProfile).toHaveBeenCalledWith(dto, headers);
    });
  });

  describe('uploadProfileImage', () => {
    const profileImage = {
      buffer: Buffer.from('fake-image'),
      originalname: 'photo.png',
    } as Express.Multer.File;
    const headers = { authorization: 'Bearer token123' };

    it('should call usersService.uploadProfileImage with the existing imageKey', async () => {
      const session = {
        user: { id: 'user-123', imageKey: 'profile-images/old.png' },
      } as CurrentUser;
      usersService.uploadProfileImage.mockResolvedValue(undefined);

      await controller.uploadProfileImage(profileImage, session, headers);

      expect(usersService.uploadProfileImage).toHaveBeenCalledWith(
        profileImage,
        'profile-images/old.png',
        session.user.id,
        headers,
      );
    });

    it('should pass null when session.user.imageKey is undefined', async () => {
      const session = {
        user: { id: 'user-123', imageKey: undefined },
      } as CurrentUser;
      usersService.uploadProfileImage.mockResolvedValue(undefined);

      await controller.uploadProfileImage(profileImage, session, headers);

      expect(usersService.uploadProfileImage).toHaveBeenCalledWith(
        profileImage,
        null,
        session.user.id,
        headers,
      );
    });
  });

  describe('deleteProfileImage', () => {
    const headers = { authorization: 'Bearer token123' };

    it('should call usersService.deleteProfileImage with the existing imageKey', async () => {
      const session = {
        user: { id: 'user-123', imageKey: 'profile-images/old.png' },
      } as CurrentUser;
      usersService.deleteProfileImage.mockResolvedValue(undefined);

      await controller.deleteProfileImage(session, headers);

      expect(usersService.deleteProfileImage).toHaveBeenCalledWith(
        'profile-images/old.png',
        session.user.id,
        headers,
      );
    });

    it('should pass null when session.user.imageKey is undefined', async () => {
      const session = {
        user: { id: 'user-123', imageKey: undefined },
      } as CurrentUser;
      usersService.deleteProfileImage.mockResolvedValue(undefined);

      await controller.deleteProfileImage(session, headers);

      expect(usersService.deleteProfileImage).toHaveBeenCalledWith(
        null,
        session.user.id,
        headers,
      );
    });
  });
});
