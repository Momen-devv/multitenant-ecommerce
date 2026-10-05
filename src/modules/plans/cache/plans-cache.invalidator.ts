import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { plans } from '@/infrastructure/database/schema/billing.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { ReadCacheService } from '@/infrastructure/cache/read-cache.service';
import { beforeDeadline } from '@/infrastructure/cache/cache-deadline';
import { planDetailPolicy } from './public-plans.cache';

@Injectable()
export class PlansCacheInvalidator {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly cache: ReadCacheService,
  ) {}

  // Called only after a repository write/transaction resolves successfully.
  async afterCommit(planId: string, oldCodes: string[] = []): Promise<void> {
    if (!this.cache.isConfigured()) return;
    const codes = new Set(oldCodes);
    try {
      const plan = await beforeDeadline(performance.now() + 100, () =>
        this.db.query.plans.findFirst({
          where: eq(plans.id, planId),
          columns: { code: true },
        }),
      );
      if (plan) codes.add(plan.code);
    } catch {
      this.cache.record('plan-detail', 'invalidation-error');
    }
    try {
      await this.cache.invalidate(
        { kind: 'plans' },
        [...codes].map((code) => planDetailPolicy(code, false)),
      );
    } catch {
      this.cache.record('plan-detail', 'invalidation-error');
    }
  }
}
