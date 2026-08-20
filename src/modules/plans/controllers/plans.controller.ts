import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { PlansService } from '../services/plans.service';
import { CreatePlanDto, CreatePlanPriceDto, UpdatePlanDto } from '../dto';
import { AuthRole } from '@/common/enums';
import { AllowAnonymous, Roles } from '@thallesp/nestjs-better-auth';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
} from '@/common/decorators';
import { seconds, Throttle } from '@nestjs/throttler';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Plans')
@Roles([AuthRole.SUPER_ADMIN])
@Controller()
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @ApiCookieAuth('mte.session_token')
  @ApiOperation({
    summary: 'Create a plan',
    description:
      'Creates a pending plan and schedules its Stripe product and prices for asynchronous provisioning.',
  })
  @ApiSuccessResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Plan accepted for provisioning',
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid plan data')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Plan code already exists')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ResponseMessage('Plan created successfully')
  @Post('admin/plans')
  @HttpCode(HttpStatus.ACCEPTED)
  async createPlan(@Body() dto: CreatePlanDto) {
    return await this.plansService.createPlan(dto);
  }

  @ApiCookieAuth('mte.session_token')
  @ApiOperation({ summary: 'List all plans for administration' })
  @ApiSuccessResponse({ description: 'Plans retrieved successfully' })
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ResponseMessage('Plans retrieved successfully')
  @Get('admin/plans')
  async listPlans() {
    return await this.plansService.listPlans();
  }

  @ApiCookieAuth('mte.session_token')
  @ApiOperation({ summary: 'Get a plan for administration' })
  @ApiParam({ name: 'id', description: 'Plan ID', format: 'uuid' })
  @ApiSuccessResponse({ description: 'Plan retrieved successfully' })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid plan ID')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Plan not found')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ResponseMessage('Plan retrieved successfully')
  @Get('admin/plans/:id')
  async getPlan(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.plansService.getPlan(id);
  }

  @ApiCookieAuth('mte.session_token')
  @ApiOperation({ summary: 'Update a plan' })
  @ApiParam({ name: 'id', description: 'Plan ID', format: 'uuid' })
  @ApiSuccessResponse({ description: 'Plan updated successfully' })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid plan ID or update data')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Plan not found')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ResponseMessage('Plan updated successfully')
  @Patch('admin/plans/:id')
  async updatePlan(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return await this.plansService.updatePlan(id, dto);
  }

  @ApiCookieAuth('mte.session_token')
  @ApiOperation({ summary: 'Add a recurring price to a plan' })
  @ApiParam({ name: 'id', description: 'Plan ID', format: 'uuid' })
  @ApiSuccessResponse({
    status: HttpStatus.CREATED,
    description: 'Plan price added successfully',
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid plan ID or price data')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Plan not found')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Plan is not ready or the price conflicts with an existing price',
  )
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ResponseMessage('Plan price added successfully')
  @Post('admin/plans/:id/prices')
  @HttpCode(HttpStatus.CREATED)
  async addPlanPrice(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreatePlanPriceDto,
  ) {
    return await this.plansService.addPlanPrice(id, dto);
  }

  @ApiCookieAuth('mte.session_token')
  @ApiOperation({
    summary: 'Deactivate a plan price',
    description:
      'Stops offering the price to new subscriptions without affecting existing subscriptions.',
  })
  @ApiParam({ name: 'id', description: 'Plan ID', format: 'uuid' })
  @ApiParam({ name: 'priceId', description: 'Plan price ID', format: 'uuid' })
  @ApiSuccessResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Plan price deactivated successfully',
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid plan or price ID')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Plan or plan price not found')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Plan price is not provisioned')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ResponseMessage('Plan price deactivated successfully')
  @Post('admin/plans/:id/prices/:priceId/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivatePlanPrice(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('priceId', new ParseUUIDPipe()) priceId: string,
  ) {
    await this.plansService.deactivatePlanPrice(id, priceId);
  }

  @ApiCookieAuth('mte.session_token')
  @ApiOperation({
    summary: 'Activate a plan',
    description:
      'Makes a fully provisioned plan available for new subscriptions. At least one active provisioned price is required.',
  })
  @ApiParam({ name: 'id', description: 'Plan ID', format: 'uuid' })
  @ApiSuccessResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Plan activated successfully',
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid plan ID')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Plan not found')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Plan is not ready or has no active provisioned price',
  )
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ResponseMessage('Plan activated successfully')
  @Post('admin/plans/:id/activate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async activatePlan(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.plansService.activatePlan(id);
  }

  @ApiCookieAuth('mte.session_token')
  @ApiOperation({
    summary: 'Deactivate a plan',
    description:
      'Hides the plan from new subscriptions and archives its Stripe product without affecting existing subscriptions.',
  })
  @ApiParam({ name: 'id', description: 'Plan ID', format: 'uuid' })
  @ApiSuccessResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Plan deactivated successfully',
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid plan ID')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Plan not found')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Plan is not fully provisioned')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ResponseMessage('Plan deactivated successfully')
  @Post('admin/plans/:id/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivatePlan(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.plansService.deactivatePlan(id);
  }

  @ApiCookieAuth('mte.session_token')
  @ApiOperation({
    summary: 'Retry failed plan provisioning',
    description:
      'Resets a non-ready plan to pending and schedules another provisioning attempt.',
  })
  @ApiParam({ name: 'id', description: 'Plan ID', format: 'uuid' })
  @ApiSuccessResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Plan provisioning retry accepted',
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid plan ID')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Plan not found')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Plan is already ready or its provisioning state changed',
  )
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  @ResponseMessage('Plan provisioning retried successfully')
  @Post('admin/plans/:id/provisioning/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retryPlanProvisioning(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.plansService.retryProvisioning(id);
  }

  @ApiOperation({
    summary: 'List plans available for new subscriptions',
  })
  @ApiSuccessResponse({ description: 'Active plans retrieved successfully' })
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ResponseMessage('Active plans retrieved successfully')
  @AllowAnonymous()
  @Get('plans')
  async listActivePlans() {
    return await this.plansService.listActivePlans();
  }

  @ApiOperation({ summary: 'Get an active plan by code' })
  @ApiParam({
    name: 'code',
    description: 'Lowercase plan code',
    example: 'professional',
  })
  @ApiSuccessResponse({ description: 'Active plan retrieved successfully' })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Active plan not found')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ResponseMessage('Active plan retrieved successfully')
  @AllowAnonymous()
  @Get('plans/:code')
  async getActivePlanByCode(@Param('code') code: string) {
    return await this.plansService.getActivePlanByCode(code);
  }
}
