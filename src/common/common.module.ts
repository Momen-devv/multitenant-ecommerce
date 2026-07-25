import { Module } from '@nestjs/common';
import { ImageProcessingService } from './services/Image-processing.service';

@Module({
  providers: [ImageProcessingService],
  exports: [ImageProcessingService],
})
export class CommonModule {}
