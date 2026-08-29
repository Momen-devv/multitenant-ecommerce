import type { ApiListQueryInput, CursorPage } from '@/common/api-query';
import type {
  Plan,
  PlanPrice,
} from '@/infrastructure/database/schema/schema.types';

export type PublicPlan = Pick<
  Plan,
  'id' | 'name' | 'code' | 'description' | 'features' | 'limits'
> & {
  prices: Array<Pick<PlanPrice, 'id' | 'amount' | 'currency' | 'interval'>>;
};

export interface IPublicPlansRepository {
  findActivePage(
    input: ApiListQueryInput,
  ): Promise<CursorPage<Record<string, unknown>>>;
  findActiveByCode(code: string): Promise<PublicPlan | undefined>;
}
