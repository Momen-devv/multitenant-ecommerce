import { Injectable, BadRequestException } from '@nestjs/common';
import { fileTypeFromBuffer, type FileTypeResult } from 'file-type';
import sharp from 'sharp';

@Injectable()
export class ImageProcessingService {
  private readonly allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

  private readonly sharpFormatMap: Record<string, 'jpeg' | 'png' | 'webp'> = {
    jpg: 'jpeg',
    png: 'png',
    webp: 'webp',
  };

  async validateAndSanitize(
    image: Express.Multer.File,
  ): Promise<Express.Multer.File> {
    const detectedType: FileTypeResult | undefined = await fileTypeFromBuffer(
      image.buffer,
    );
    if (!detectedType || !this.allowedMimes.includes(detectedType.mime)) {
      throw new BadRequestException(
        'Invalid image file type. Allowed types: JPEG, PNG, WebP',
      );
    }

    const sharpFormat = this.sharpFormatMap[detectedType.ext];
    if (!sharpFormat) {
      throw new BadRequestException(
        'Invalid image file type. Allowed types: JPEG, PNG, WebP',
      );
    }

    let cleanBuffer: Buffer;
    try {
      cleanBuffer = await sharp(image.buffer)
        .rotate()
        .toFormat(sharpFormat)
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'Invalid image file. The file may be corrupted or not a valid image.',
      );
    }

    image.buffer = cleanBuffer;
    image.size = cleanBuffer.byteLength;
    image.mimetype = detectedType.mime;
    return image;
  }
}
