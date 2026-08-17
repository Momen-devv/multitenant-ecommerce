import { Controller, Get, Patch, Post } from '@nestjs/common';

@Controller()
export class PlansController {
  @Post('admin/plans')
  createPlan() {}

  @Get('admin/plans')
  listPlans() {}

  @Get('admin/plans/:id')
  getPlan() {}

  @Patch('admin/plans/:id')
  updatePlan() {}

  @Post('admin/plans/:id/prices')
  addPlanPrice() {}

  @Patch('admin/plans/:id/activate')
  activatePlan() {}

  @Patch('admin/plans/:id/deactivate')
  deactivatePlan() {}

  @Get('plans')
  listActivePlans() {}
}
