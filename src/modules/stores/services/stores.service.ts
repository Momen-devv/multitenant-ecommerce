import {
  ConflictException,
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

@Injectable()
export class StoresService {
  constructor(
    private readonly storeRepository: StoreRepository,
    private readonly storage: StorageService,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly resourceCleanupQueue: ResourceCleanupQueueService,
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
}
