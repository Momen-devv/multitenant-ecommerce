import { ConflictException, Injectable } from '@nestjs/common';
import { PlansRepository } from '../repos/plans.repository';
import { BillingCatalogService } from '@/modules/billing/billing-catalog.service';
import { CreatePlanDto } from '../dto';

@Injectable()
export class PlansService {
  constructor(
    private readonly plansRepository: PlansRepository,
    private readonly billingCatalogService: BillingCatalogService,
  ) {}

  async createPlan(dto: CreatePlanDto) {
    const existingPlan = await this.plansRepository.findByCode(dto.code);

    if (existingPlan) {
      throw new ConflictException('A plan with this code already exists');
    }

    // First create a local draft. We need its ID in Stripe metadata.
    const plan = await this.plansRepository.create({
      name: dto.name,
      code: dto.code,
      description: dto.description,
      features: dto.features,
      limits: dto.limits,
      isActive: false,
      stripeProductId: null, // Make this nullable in the initial migration.
    });

    const stripeData = await this.billingCatalogService.createProductWithPrices(
      {
        planId: plan.id,
        name: dto.name,
        description: dto.description,
        code: dto.code,
        prices: dto.prices,
      },
    );

    return this.plansRepository.activatePlanWithPrices({
      planId: plan.id,
      stripeProductId: stripeData.product.id,
      prices: stripeData.prices.map((stripePrice) => ({
        stripePriceId: stripePrice.id,
        stripeLookupKey: stripePrice.lookup_key,
        amount: stripePrice.unit_amount!,
        currency: stripePrice.currency,
        interval: stripePrice.recurring!.interval as 'month' | 'year',
      })),
    });
  }

  listPlans() {}

  getPlan(_id: string) {}

  updatePlan(_id: string) {}

  addPlanPrice(_id: string) {}

  activatePlan(_id: string) {}

  deactivatePlan(_id: string) {}

  listActivePlans() {}
}
