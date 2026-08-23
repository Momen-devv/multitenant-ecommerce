import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlansRepository } from '../repos/plans.repository';
import { CreatePlanDto, CreatePlanPriceDto, UpdatePlanDto } from '../dto';
import { PlanCodeConflictError } from '@/common/errors/plan-code-conflict.error';
import { PlanProvisioningStatus } from '@/common/enums/plan-provisioning-status.enum';
import { PlanProvisioningQueueService } from '@/infrastructure/queue/plan-provisioning/plan-provisioning-queue.service';
import { BillingCatalogService } from '@/modules/billing/services/billing-catalog.service';
import { BillingInterval } from '@/common/enums';
import type { ApiListQueryInput } from '@/common/api-query';

@Injectable()
export class PlansService {
  constructor(
    private readonly plansRepository: PlansRepository,
    private readonly planProvisioningQueue: PlanProvisioningQueueService,
    private readonly billingCatalog: BillingCatalogService,
  ) {}

  async createPlan(dto: CreatePlanDto) {
    try {
      const plan = await this.plansRepository.createPendingWithPrices({
        plan: {
          name: dto.name,
          code: dto.code,
          description: dto.description,
          features: dto.features,
          limits: dto.limits,
        },
        prices: dto.prices,
      });

      if (!plan) {
        throw new Error('Failed to load the newly created pending plan');
      }

      return {
        id: plan.id,
        code: plan.code,
        provisioningStatus: plan.provisioningStatus,
      };
    } catch (error) {
      if (error instanceof PlanCodeConflictError) {
        throw new ConflictException('A plan with this code already exists');
      }
      throw error;
    }
  }

  async listPlans(query: ApiListQueryInput) {
    return await this.plansRepository.findPage(query);
  }

  async getPlan(id: string) {
    const plan = await this.plansRepository.findById(id);
    if (!plan) {
      throw new NotFoundException(`Plan ${id} was not found`);
    }

    return plan;
  }

  async retryProvisioning(id: string) {
    const plan = await this.plansRepository.findById(id);
    if (!plan) {
      throw new NotFoundException(`Plan ${id} was not found`);
    }

    if (plan.provisioningStatus === PlanProvisioningStatus.READY) {
      throw new ConflictException('A ready plan does not need provisioning');
    }

    const reset = await this.plansRepository.resetProvisioningForRetry(
      plan.id,
      plan.provisioningVersion,
    );
    if (!reset) {
      throw new ConflictException('The plan provisioning state has changed');
    }

    await this.planProvisioningQueue.retryProvisionPlanJob({
      planId: plan.id,
      provisioningVersion: plan.provisioningVersion,
    });

    return {
      id: plan.id,
      provisioningStatus: PlanProvisioningStatus.PENDING,
    };
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const updates = this.getDefinedPlanUpdates(dto);
    if (Object.keys(updates).length === 0) {
      throw new BadRequestException('At least one plan field must be provided');
    }

    const plan = await this.plansRepository.findById(id);
    if (!plan) {
      throw new NotFoundException(`Plan ${id} was not found`);
    }

    await this.syncStripeProduct(plan.stripeProductId, updates);

    return await this.plansRepository.updatePlan(id, updates);
  }

  async addPlanPrice(id: string, dto: CreatePlanPriceDto) {
    const result = await this.plansRepository.createOrFindPendingPrice(id, dto);

    switch (result.status) {
      case 'plan_not_found':
        throw new NotFoundException(`Plan ${id} was not found`);
      case 'plan_not_ready':
        throw new ConflictException('Prices can be added only to a ready plan');
      case 'active_price_exists':
        throw new ConflictException(
          'An active price already exists for this currency and interval',
        );
      case 'pending_price_exists':
        throw new ConflictException(
          'A different pending price exists for this currency and interval',
        );
      case 'ready':
        break;
    }

    const stripePrice = await this.billingCatalog.createPlanPrice({
      planId: result.plan.id,
      planPriceId: result.price.id,
      planCode: result.plan.code,
      stripeProductId: result.plan.stripeProductId!,
      amount: result.price.amount,
      currency: result.price.currency,
      interval: result.price.interval as BillingInterval,
    });

    const activated = await this.plansRepository.activatePendingPrice({
      planId: result.plan.id,
      planPriceId: result.price.id,
      stripePriceId: stripePrice.id,
      stripeLookupKey: stripePrice.lookup_key,
    });

    if (!activated) {
      throw new ConflictException('The plan price state has changed');
    }

    return activated;
  }

  async deactivatePlanPrice(id: string, priceId: string): Promise<void> {
    const plan = await this.plansRepository.findById(id);
    if (!plan) {
      throw new NotFoundException(`Plan ${id} was not found`);
    }

    const price = await this.plansRepository.findPriceById(id, priceId);
    if (!price) {
      throw new NotFoundException(`Plan price ${priceId} was not found`);
    }
    if (!price.stripePriceId) {
      throw new ConflictException('The plan price has not been provisioned');
    }

    await this.plansRepository.deactivatePrice(id, priceId);
    await this.billingCatalog.archivePrice(price.stripePriceId);
  }

  async activatePlan(id: string): Promise<void> {
    const plan = await this.getReadyPlan(id);
    const hasActivePrice = plan.prices.some(
      (price) => price.isActive && price.stripePriceId,
    );

    if (!hasActivePrice) {
      throw new ConflictException(
        'A plan must have at least one active provisioned price before activation',
      );
    }

    await this.billingCatalog.activateProduct(plan.stripeProductId!);

    const activated = await this.plansRepository.activatePlan(id);
    if (!activated) {
      throw new ConflictException('The plan state has changed');
    }
  }

  async deactivatePlan(id: string): Promise<void> {
    const plan = await this.getReadyPlan(id);

    const deactivated = await this.plansRepository.deactivatePlan(id);
    if (!deactivated) {
      throw new ConflictException('The plan state has changed');
    }

    await this.billingCatalog.archiveProduct(plan.stripeProductId!);
  }

  listActivePlans(query: ApiListQueryInput) {
    return this.plansRepository.findActivePage(query);
  }

  async getActivePlanByCode(code: string) {
    const plan = await this.plansRepository.findActiveByCode(
      code.trim().toLowerCase(),
    );
    if (!plan) {
      throw new NotFoundException(`Active plan ${code} was not found`);
    }

    return plan;
  }

  private getDefinedPlanUpdates(dto: UpdatePlanDto): UpdatePlanDto {
    return {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.features !== undefined && { features: dto.features }),
      ...(dto.limits !== undefined && { limits: dto.limits }),
    };
  }

  private async syncStripeProduct(
    stripeProductId: string | null,
    updates: UpdatePlanDto,
  ): Promise<void> {
    if (
      !stripeProductId ||
      (updates.name === undefined && updates.description === undefined)
    ) {
      return;
    }

    await this.billingCatalog.updateProduct(stripeProductId, {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.description !== undefined && {
        description: updates.description,
      }),
    });
  }

  private async getReadyPlan(id: string) {
    const plan = await this.plansRepository.findById(id);
    if (!plan) {
      throw new NotFoundException(`Plan ${id} was not found`);
    }

    if (
      plan.provisioningStatus !== PlanProvisioningStatus.READY ||
      !plan.stripeProductId
    ) {
      throw new ConflictException(
        'Only a fully provisioned plan can change activation state',
      );
    }

    return plan;
  }
}
