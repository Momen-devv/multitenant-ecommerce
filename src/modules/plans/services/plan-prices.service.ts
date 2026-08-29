import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PLAN_PRICES_REPOSITORY,
  PLATFORM_PLANS_REPOSITORY,
  type IPlanPricesRepository,
  type IPlatformPlansRepository,
} from '../interfaces/repos';
import { CreatePlanPriceDto } from '../dto';
import { BillingCatalogService } from '@/modules/billing/services/billing-catalog.service';
import { BillingInterval } from '@/common/enums';

@Injectable()
export class PlanPricesService {
  constructor(
    @Inject(PLAN_PRICES_REPOSITORY)
    private readonly planPricesRepository: IPlanPricesRepository,
    @Inject(PLATFORM_PLANS_REPOSITORY)
    private readonly platformPlansRepository: IPlatformPlansRepository,
    private readonly billingCatalog: BillingCatalogService,
  ) {}

  async addPlanPrice(id: string, dto: CreatePlanPriceDto) {
    const result = await this.planPricesRepository.createOrFindPendingPrice(
      id,
      dto,
    );
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
    const activated = await this.planPricesRepository.activatePendingPrice({
      planId: result.plan.id,
      planPriceId: result.price.id,
      stripePriceId: stripePrice.id,
      stripeLookupKey: stripePrice.lookup_key,
    });
    if (!activated)
      throw new ConflictException('The plan price state has changed');
    return activated;
  }

  async deactivatePlanPrice(id: string, priceId: string): Promise<void> {
    const plan = await this.platformPlansRepository.findById(id);
    if (!plan) throw new NotFoundException(`Plan ${id} was not found`);
    const price = await this.planPricesRepository.findPriceById(id, priceId);
    if (!price)
      throw new NotFoundException(`Plan price ${priceId} was not found`);
    if (!price.stripePriceId)
      throw new ConflictException('The plan price has not been provisioned');
    await this.planPricesRepository.deactivatePrice(id, priceId);
    await this.billingCatalog.archivePrice(price.stripePriceId);
  }
}
