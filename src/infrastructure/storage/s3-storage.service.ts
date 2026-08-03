import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { S3_CLIENT } from './storage.constants';
import { StorageService } from '@/common/abstracts/storage.abstracts';
import { LoggerService } from '../logger/logger.service';
import storageConfig from '@/core/config/storage.config';
import type { ConfigType } from '@nestjs/config';
import { Environment } from '@/common/enums/environment.enum';

@Injectable()
export class AwsS3StorageService
  extends StorageService
  implements OnModuleInit
{
  private readonly bucketName: string;
  private readonly isLocal: boolean;

  constructor(
    @Inject(S3_CLIENT) private readonly s3Client: S3Client,
    @Inject(storageConfig.KEY)
    private readonly configuration: ConfigType<typeof storageConfig>,
    private readonly logger: LoggerService,
  ) {
    super();
    this.bucketName = this.configuration.AWS_S3_BUCKET_NAME;
    this.isLocal = process.env.NODE_ENV !== Environment.Production;
  }

  async onModuleInit() {
    await this.checkAndCreateBucket();
  }

  async uploadFile(
    file: Express.Multer.File,
    destinationPath: string,
  ): Promise<string> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: destinationPath,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
      }),
    );

    return this.buildUrl(destinationPath);
  }

  async deleteFile(filePath: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: filePath,
      }),
    );
  }

  private buildUrl(filePath: string): string {
    if (this.isLocal) {
      return `${this.configuration.AWS_ENDPOINT}/${this.bucketName}/${filePath}`;
    }
    return `https://${this.bucketName}.s3.${this.configuration.AWS_REGION}.amazonaws.com/${filePath}`;
  }

  private async checkAndCreateBucket() {
    try {
      await this.s3Client.send(
        new HeadBucketCommand({ Bucket: this.bucketName }),
      );
      this.logger.log(
        `Bucket "${this.bucketName}" already exists`,
        AwsS3StorageService.name,
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFound') {
        this.logger.log(
          `Creating bucket "${this.bucketName}"`,
          AwsS3StorageService.name,
        );
        await this.s3Client.send(
          new CreateBucketCommand({ Bucket: this.bucketName }),
        );
        this.logger.log(
          `Bucket "${this.bucketName}" created`,
          AwsS3StorageService.name,
        );
      } else {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Error checking bucket "${this.bucketName}"`,
          message,
          AwsS3StorageService.name,
        );
        throw error;
      }
    }
  }
}
