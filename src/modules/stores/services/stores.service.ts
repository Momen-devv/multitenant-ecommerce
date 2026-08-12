import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StoreRepository } from '../repos/store.repository';
import { CreateStoreDto, UpdateStoreDto } from '../dto';
import { StorageService } from '@/common/abstracts/storage.abstracts';
import { ImageProcessingService } from '@/common/services/Image-processing.service';
import { ResourceCleanupQueueService } from '@/infrastructure/queue/resource-cleanup/resource-cleanup-queue.service';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { Auth } from '@/core/auth/auth';
import { fromNodeHeaders } from 'better-auth/node';
import { randomUUID } from 'node:crypto';
import slugify from 'slugify';
import { SlugConflictError } from '@/common/errors/slug-conflict.error';
import { Store } from '@/infrastructure/database/schema/schema.types';
import { DataSyncQueueService } from '@/infrastructure/queue/data-sync/data-sync-queue.service';

@Injectable()
export class StoresService {
  constructor(
    private readonly storeRepository: StoreRepository,
    private readonly storage: StorageService,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly resourceCleanupQueue: ResourceCleanupQueueService,
    private readonly dataSyncQueue: DataSyncQueueService,
    private readonly logger: LoggerService,
    private readonly authService: AuthService<Auth>,
  ) {}
  async createStore(
    dto: CreateStoreDto,
    userId: string,
    headers: Record<string, string>,
  ) {
    const existingStore = await this.storeRepository.findByOwnerId(userId);
    if (existingStore) {
      throw new ConflictException('You already have a store');
    }

    const slug = this.generateSlug(dto.name, dto.slug);

    const slugExists = await this.storeRepository.findBySlug(slug);
    if (slugExists) {
      throw new ConflictException(this.buildSlugConflictMessage(dto));
    }

    const org = await this.authService.api.createOrganization({
      body: { name: dto.name, slug },
      headers: fromNodeHeaders(headers),
    });

    try {
      const newStore = await this.storeRepository.create({
        organizationId: org.id,
        ownerId: userId,
        name: dto.name,
        slug,
        description: dto.description,
      });

      this.logger.log('Store created', StoresService.name, {
        storeId: newStore.id,
        userId,
      });

      return newStore;
    } catch (err) {
      await this.deleteOrphanedOrg(org.id);

      if (err instanceof SlugConflictError) {
        throw new ConflictException(this.buildSlugConflictMessage(dto));
      }
      throw err;
    }
  }

  async getStore(userId: string) {
    const existingStore = await this.storeRepository.findByOwnerId(userId);
    if (!existingStore) {
      throw new NotFoundException('Store not found or you do not have store');
    }
    return existingStore;
  }

  async updateStore(
    dto: UpdateStoreDto,
    userId: string,
    headers: Record<string, string>,
  ) {
    const existingStore = await this.storeRepository.findByOwnerId(userId);
    if (!existingStore) {
      throw new NotFoundException('Store not found or you do not have a store');
    }
    if (!existingStore.isActive) {
      throw new ForbiddenException(
        'Store is suspended, contact support for assistance',
      );
    }

    if (dto.name === undefined && dto.description === undefined) {
      throw new BadRequestException(
        'At least one field must be provided to update',
      );
    }

    const updatePayload: Partial<Pick<Store, 'name' | 'description'>> = {};
    if (dto.name !== undefined) updatePayload.name = dto.name;
    if (dto.description !== undefined)
      updatePayload.description = dto.description;

    const updated = await this.storeRepository.update(
      existingStore.id,
      updatePayload,
    );

    this.logger.log('Store updated', StoresService.name, {
      storeId: existingStore.id,
      userId,
    });

    const nameChanged =
      dto.name !== undefined && dto.name !== existingStore.name;
    if (nameChanged) {
      await this.syncOrganizationName(
        existingStore.organizationId,
        dto.name!,
        headers,
      );
    }

    return updated;
  }
  async deactivateStore(userId: string, headers: Record<string, string>) {
    const existingStore = await this.storeRepository.findByOwnerId(userId);
    if (!existingStore) {
      throw new NotFoundException('Store not found or you do not have a store');
    }
    if (!existingStore.isActive) {
      throw new ForbiddenException(
        'Store is suspended, contact support for assistance',
      );
    }

    await this.storeRepository.deactivateStore(existingStore.id);

    await this.authService.api.updateOrganization({
      body: {
        organizationId: existingStore.organizationId,
        data: { metadata: { suspended: true } },
      },
      headers: fromNodeHeaders(headers),
    });

    this.logger.log('Store deactivated', StoresService.name, {
      storeId: existingStore.id,
      userId,
    });
  }

  async uploadStoreLogo(logo: Express.Multer.File, userId: string) {
    const existingStore = await this.storeRepository.findByOwnerId(userId);
    if (!existingStore) {
      throw new NotFoundException('Store not found or you do not have a store');
    }

    if (!existingStore.isActive) {
      throw new ForbiddenException(
        'Store is suspended, contact support for assistance',
      );
    }

    const sanitizedImage =
      await this.imageProcessingService.validateAndSanitize(logo);
    const filePath = `store-logos/${randomUUID()}.${sanitizedImage.mimetype.split('/')[1]}`;

    const url = await this.storage.uploadFile(sanitizedImage, filePath);

    try {
      await this.storeRepository.update(existingStore.id, {
        logo: url,
        logoKey: filePath,
      });
    } catch (error) {
      this.logger.error(
        'Failed to update store logo',
        error,
        StoresService.name,
      );

      await this.resourceCleanupQueue
        .addDeleteOrphanedFileJob(filePath)
        .catch((enqueueError) =>
          this.logger.error(
            `Failed to enqueue orphaned file cleanup for "${filePath}"`,
            enqueueError,
            StoresService.name,
          ),
        );

      throw error;
    }

    if (existingStore.logoKey) {
      await this.resourceCleanupQueue
        .addDeleteOldFileJob(existingStore.logoKey)
        .catch((enqueueError) =>
          this.logger.error(
            `Failed to enqueue old logo cleanup for "${existingStore.logoKey}"`,
            enqueueError,
            StoresService.name,
          ),
        );
    }

    this.logger.log('Store logo updated', StoresService.name, {
      storeId: existingStore.id,
      userId,
    });
  }

  private generateSlug(name: string, providedSlug?: string): string {
    return slugify(providedSlug ?? name, {
      lower: true,
      strict: true,
      trim: true,
    });
  }
  private buildSlugConflictMessage(dto: CreateStoreDto): string {
    return dto.slug
      ? `The slug "${dto.slug}" is already taken. Please choose a different slug.`
      : `A store named "${dto.name}" already exists. Please choose a different name or a custom slug.`;
  }

  private async deleteOrphanedOrg(orgId: string): Promise<void> {
    await this.resourceCleanupQueue
      .addDeleteOrphanedOrgJob(orgId)
      .catch((enqueueError) =>
        this.logger.error(
          `Failed to enqueue orphaned organization cleanup for "${orgId}"`,
          enqueueError,
          StoresService.name,
        ),
      );
  }

  private async syncOrganizationName(
    organizationId: string,
    name: string,
    headers: Record<string, string>,
  ): Promise<void> {
    try {
      await this.authService.api.updateOrganization({
        body: { organizationId, data: { name } },
        headers: fromNodeHeaders(headers),
      });
    } catch (err) {
      this.logger.error(
        `Failed to sync organization name for org "${organizationId}"`,
        err,
        StoresService.name,
      );

      await this.dataSyncQueue
        .addSyncOrgNameJob(organizationId, name)
        .catch((enqueueError) =>
          this.logger.error(
            `Failed to enqueue org-name sync retry for "${organizationId}"`,
            enqueueError,
            StoresService.name,
          ),
        );
    }
  }
}
