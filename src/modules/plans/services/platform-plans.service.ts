import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PLATFORM_PLANS_REPOSITORY,
  type IPlatformPlansRepository,
} from '../interfaces/repos';
import { CreatePlanDto, UpdatePlanDto } from '../dto';
import { PlanCodeConflictError } from '@/common/errors/plan-code-conflict.error';
import { PlanProvisioningStatus } from '@/common/enums/plan-provisioning-status.enum';
import { PlanProvisioningQueueService } from '@/infrastructure/queue/plan-provisioning/plan-provisioning-queue.service';
import { BillingCatalogService } from '@/modules/billing/services/billing-catalog.service';
import type { ApiListQueryInput } from '@/common/api-query';

@Injectable()
export class PlatformPlansService {
  constructor(
    @Inject(PLATFORM_PLANS_REPOSITORY)
    private readonly plansRepository: IPlatformPlansRepository,
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
      if (!plan)
        throw new Error('Failed to load the newly created pending plan');
      return {
        id: plan.id,
        code: plan.code,
        provisioningStatus: plan.provisioningStatus,
      };
    } catch (error) {
      if (error instanceof PlanCodeConflictError)
        throw new ConflictException('A plan with this code already exists');
      throw error;
    }
  }

  async listPlans(query: ApiListQueryInput) {
    return await this.plansRepository.findPage(query);
  }

  async getPlan(id: string) {
    const plan = await this.plansRepository.findById(id);
    if (!plan) throw new NotFoundException(`Plan ${id} was not found`);
    return plan;
  }

  async retryProvisioning(id: string) {
    const plan = await this.getPlan(id);
    if (plan.provisioningStatus === PlanProvisioningStatus.READY)
      throw new ConflictException('A ready plan does not need provisioning');
    const reset = await this.plansRepository.resetProvisioningForRetry(
      plan.id,
      plan.provisioningVersion,
    );
    if (!reset)
      throw new ConflictException('The plan provisioning state has changed');
    await this.planProvisioningQueue.retryProvisionPlanJob({
      planId: plan.id,
      provisioningVersion: plan.provisioningVersion,
    });
    return { id: plan.id, provisioningStatus: PlanProvisioningStatus.PENDING };
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const updates = this.getDefinedPlanUpdates(dto);
    if (Object.keys(updates).length === 0)
      throw new BadRequestException('At least one plan field must be provided');
    const plan = await this.getPlan(id);
    await this.syncStripeProduct(plan.stripeProductId, updates);
    return await this.plansRepository.updatePlan(id, updates);
  }

  async activatePlan(id: string): Promise<void> {
    const plan = await this.getReadyPlan(id);
    if (!plan.prices.some((price) => price.isActive && price.stripePriceId))
      throw new ConflictException(
        'A plan must have at least one active provisioned price before activation',
      );
    await this.billingCatalog.activateProduct(plan.stripeProductId!);
    if (!(await this.plansRepository.activatePlan(id)))
      throw new ConflictException('The plan state has changed');
  }

  async deactivatePlan(id: string): Promise<void> {
    const plan = await this.getReadyPlan(id);
    if (!(await this.plansRepository.deactivatePlan(id)))
      throw new ConflictException('The plan state has changed');
    await this.billingCatalog.archiveProduct(plan.stripeProductId!);
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
    )
      return;
    await this.billingCatalog.updateProduct(stripeProductId, {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.description !== undefined && {
        description: updates.description,
      }),
    });
  }
  private async getReadyPlan(id: string) {
    const plan = await this.getPlan(id);
    if (
      plan.provisioningStatus !== PlanProvisioningStatus.READY ||
      !plan.stripeProductId
    )
      throw new ConflictException(
        'Only a fully provisioned plan can change activation state',
      );
    return plan;
  }
}
