import { Injectable, NotFoundException } from '@nestjs/common';
import { PublicPlansRepository } from '../repos/public-plans.repository';
import type { ApiListQueryInput } from '@/common/api-query';

@Injectable()
export class PublicPlansService {
  constructor(private readonly plansRepository: PublicPlansRepository) {}

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
