import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PUBLIC_PLANS_REPOSITORY,
  type IPublicPlansRepository,
} from '../interfaces/repos';
import { prepareApiQuery, type ApiListQueryInput } from '@/common/api-query';
import type { ConfigType } from '@nestjs/config';
import endpointCacheConfig from '@/core/config/endpoint-cache.config';
import { ReadCacheService } from '@/infrastructure/cache/read-cache.service';
import { planDetailPolicy, planListPolicy } from '../cache/public-plans.cache';
import { publicPlanQuery } from '../queries/public-plan.query';

@Injectable()
export class PublicPlansService {
  constructor(
    @Inject(PUBLIC_PLANS_REPOSITORY)
    private readonly plansRepository: IPublicPlansRepository,
    private readonly cache?: ReadCacheService,
    @Inject(endpointCacheConfig.KEY)
    private readonly cacheConfig?: ConfigType<typeof endpointCacheConfig>,
  ) {}

  listActivePlans(query: ApiListQueryInput) {
    const prepared = prepareApiQuery(publicPlanQuery, query);
    const load = () => this.plansRepository.findActivePage(query);
    if (!this.cache) return load();
    return this.cache.remember(
      planListPolicy(
        prepared.effectiveArguments,
        this.cacheConfig?.planListsEnabled ?? false,
      ),
      load,
    );
  }

  async getActivePlanByCode(code: string) {
    const normalizedCode = code.trim().toLowerCase();
    const load = async () => {
      const plan = await this.plansRepository.findActiveByCode(normalizedCode);
      if (!plan)
        throw new NotFoundException(`Active plan ${code} was not found`);
      return plan;
    };
    if (!this.cache) return load();
    return this.cache.remember(
      planDetailPolicy(
        normalizedCode,
        this.cacheConfig?.planDetailsEnabled ?? false,
      ),
      load,
    );
  }
}
