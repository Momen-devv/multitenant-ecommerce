import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export const imageUploadOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_PROFILE_IMAGE_SIZE, files: 1 },
};
