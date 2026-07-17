import { Module } from '@nestjs/common';
import { AwsS3StorageService } from './s3-storage.service';
import { StorageService } from '@/common/abstracts/storage.abstracts';
import { S3ClientProvider } from './storage.config';

@Module({
  providers: [
    S3ClientProvider,
    {
      provide: StorageService,
      useClass: AwsS3StorageService,
    },
  ],

  exports: [StorageService],
})
export class StorageModule {}
