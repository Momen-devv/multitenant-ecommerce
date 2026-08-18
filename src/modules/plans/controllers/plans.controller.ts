import { Controller, Get, Param, Patch, Post, Body } from '@nestjs/common';
import { PlansService } from '../services/plans.service';
import { CreatePlanDto, CreatePlanPriceDto } from '../dto';
import { AuthRole } from '@/common/enums';
import { Roles } from '@thallesp/nestjs-better-auth';

@Roles([AuthRole.SUPER_ADMIN])
@Controller()
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post('admin/plans')
  async createPlan(@Body() dto: CreatePlanDto) {
    return await this.plansService.createPlan(dto);
  }

  @Get('admin/plans')
  listPlans() {
    return this.plansService.listPlans();
  }

  @Get('admin/plans/:id')
  getPlan(@Param('id') id: string) {
    return this.plansService.getPlan(id);
  }

  @Patch('admin/plans/:id')
  updatePlan(@Param('id') id: string) {
    return this.plansService.updatePlan(id);
  }

  @Post('admin/plans/:id/prices')
  addPlanPrice(@Param('id') id: string, dto: CreatePlanPriceDto) {
    return this.plansService.addPlanPrice(id);
  }

  @Patch('admin/plans/:id/activate')
  activatePlan(@Param('id') id: string) {
    return this.plansService.activatePlan(id);
  }

  @Patch('admin/plans/:id/deactivate')
  deactivatePlan(@Param('id') id: string) {
    return this.plansService.deactivatePlan(id);
  }

  @Get('plans')
  listActivePlans() {
    return this.plansService.listActivePlans();
  }
}
