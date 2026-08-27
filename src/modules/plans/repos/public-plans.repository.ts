import { DATABASE } from '@/common/constants/injection-tokens.constants';
import { PlanProvisioningStatus } from '@/common/enums';
import { compileApiQuery, type ApiListQueryInput } from '@/common/api-query';
import {
  planPrices,
  plans,
} from '@/infrastructure/database/schema/billing.schema';
import * as schema from '@/infrastructure/database/schema/schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { publicPlanQuery } from '../queries/public-plan.query';

@Injectable()
export class PublicPlansRepository {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findActivePage(input: ApiListQueryInput) {
    const query = compileApiQuery(publicPlanQuery, input);
    const rows = await this.db.query.plans.findMany({
      columns: query.columns,
      where: and(
        eq(plans.isActive, true),
        eq(plans.provisioningStatus, PlanProvisioningStatus.READY),
        query.where,
      ),
      orderBy: query.orderBy,
      limit: query.limit + 1,
      with: {
        prices: {
          where: eq(planPrices.isActive, true),
          columns: { id: true, amount: true, currency: true, interval: true },
        },
      },
    });
    return query.createPage(rows, (row) => ({ prices: row.prices }));
  }

  findActiveByCode(code: string) {
    return this.db.query.plans.findFirst({
      where: and(
        eq(plans.code, code),
        eq(plans.isActive, true),
        eq(plans.provisioningStatus, PlanProvisioningStatus.READY),
      ),
      columns: {
        id: true,
        name: true,
        code: true,
        description: true,
        features: true,
        limits: true,
      },
      with: {
        prices: {
          where: eq(planPrices.isActive, true),
          columns: { id: true, amount: true, currency: true, interval: true },
        },
      },
    });
  }
}
