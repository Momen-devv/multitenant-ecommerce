import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PUBLIC_PLANS_REPOSITORY,
  type IPublicPlansRepository,
} from '../interfaces/repos';
import type { ApiListQueryInput } from '@/common/api-query';

@Injectable()
export class PublicPlansService {
  constructor(
    @Inject(PUBLIC_PLANS_REPOSITORY)
    private readonly plansRepository: IPublicPlansRepository,
  ) {}

  listActivePlans(query: ApiListQueryInput) {
    return this.plansRepository.findActivePage(query);
  }

  async getActivePlanByCode(code: string) {
    const plan = await this.plansRepository.findActiveByCode(
      code.trim().toLowerCase(),
    );
    if (!plan) throw new NotFoundException(`Active plan ${code} was not found`);
    return plan;
  }
}
