import { Module } from '@nestjs/common';
import { ImageProcessingService } from './services/Image-processing.service';
import { SecureTokenService } from './services/secure-token.service';

@Module({
  providers: [ImageProcessingService, SecureTokenService],
  exports: [ImageProcessingService, SecureTokenService],
})
export class CommonModule {}
