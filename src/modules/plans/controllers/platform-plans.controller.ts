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
  Query,
} from '@nestjs/common';
import { PlatformPlansService } from '../services/platform-plans.service';
import { CreatePlanDto, UpdatePlanDto } from '../dto';
import { AuthRole } from '@/common/enums';
import { Roles } from '@thallesp/nestjs-better-auth';
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
import { ApiListQueryDto } from '@/common/api-query';

@ApiTags('Platform Plans')
@Roles([AuthRole.PLATFORM_SUPER_ADMIN])
@Controller('platform/plans')
export class PlatformPlansController {
  constructor(private readonly platformPlansService: PlatformPlansService) {}

  @ApiCookieAuth('mte.session_token')
  @ApiOperation({
    summary: 'Create a plan',
    description:
      'Creates an inactive pending plan and schedules its Stripe product and prices for asynchronous provisioning. Activate the plan separately once provisioning is ready.',
  })
  @ApiSuccessResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Plan accepted for provisioning',
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid plan data')
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Plan code already exists')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Platform super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ResponseMessage('Plan created successfully')
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async createPlan(@Body() dto: CreatePlanDto) {
    return await this.platformPlansService.createPlan(dto);
  }

  @ApiCookieAuth('mte.session_token')
  @ApiOperation({ summary: 'List all plans for platform oversight' })
  @ApiSuccessResponse({ description: 'Plans retrieved successfully' })
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Platform super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ResponseMessage('Plans retrieved successfully')
  @Get()
  async listPlans(@Query() query: ApiListQueryDto) {
    return await this.platformPlansService.listPlans(query);
  }

  @ApiCookieAuth('mte.session_token')
  @ApiOperation({ summary: 'Get a plan for platform oversight' })
  @ApiParam({ name: 'id', description: 'Plan ID', format: 'uuid' })
  @ApiSuccessResponse({ description: 'Plan retrieved successfully' })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid plan ID')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Plan not found')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Platform super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ResponseMessage('Plan retrieved successfully')
  @Get(':id')
  async getPlan(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.platformPlansService.getPlan(id);
  }

  @ApiCookieAuth('mte.session_token')
  @ApiOperation({ summary: 'Update a plan' })
  @ApiParam({ name: 'id', description: 'Plan ID', format: 'uuid' })
  @ApiSuccessResponse({ description: 'Plan updated successfully' })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid plan ID or update data')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Plan not found')
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Platform super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ResponseMessage('Plan updated successfully')
  @Patch(':id')
  async updatePlan(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return await this.platformPlansService.updatePlan(id, dto);
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
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Platform super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ResponseMessage('Plan activated successfully')
  @Post(':id/activate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async activatePlan(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.platformPlansService.activatePlan(id);
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
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Platform super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ResponseMessage('Plan deactivated successfully')
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivatePlan(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.platformPlansService.deactivatePlan(id);
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
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Platform super-admin role required')
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  @ResponseMessage('Plan provisioning retried successfully')
  @Post(':id/provisioning/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retryPlanProvisioning(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.platformPlansService.retryProvisioning(id);
  }
}
