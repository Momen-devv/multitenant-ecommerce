import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_STORE_LOGO_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_PRODUCT_IMAGES_PER_UPLOAD = 10;

export const imageUploadOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_PROFILE_IMAGE_SIZE, files: 1 },
};

export const productImagesUploadOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: MAX_PRODUCT_IMAGE_SIZE,
    files: MAX_PRODUCT_IMAGES_PER_UPLOAD,
  },
};
