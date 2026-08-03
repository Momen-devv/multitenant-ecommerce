import { S3Client } from '@aws-sdk/client-s3';
import { ConfigType } from '@nestjs/config';
import { storageConfig } from '@/core/config';
import { LoggerService } from '../logger/logger.service';
import { Environment } from '@/common/enums';
import { S3_CLIENT } from './storage.constants';

export const S3ClientProvider = {
  provide: S3_CLIENT,
  inject: [storageConfig.KEY, LoggerService],
  useFactory: (
    configuration: ConfigType<typeof storageConfig>,
    logger: LoggerService,
  ) => {
    const isLocal = process.env.NODE_ENV !== Environment.Production;

    const client = new S3Client({
      region: configuration.AWS_REGION,
      endpoint: isLocal ? configuration.AWS_ENDPOINT : undefined,
      forcePathStyle: isLocal,
      credentials: {
        accessKeyId: configuration.AWS_ACCESS_KEY_ID,
        secretAccessKey: configuration.AWS_SECRET_ACCESS_KEY,
      },
    });

    logger.log('S3 Client initialized', 'StorageModule');
    return client;
  },
};
