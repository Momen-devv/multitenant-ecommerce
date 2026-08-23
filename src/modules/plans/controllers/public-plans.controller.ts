import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { PublicPlansService } from '../services/public-plans.service';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
} from '@/common/decorators';
import { seconds, Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiListQueryDto } from '@/common/api-query';

@ApiTags('Plans')
@AllowAnonymous()
@Controller('plans')
export class PublicPlansController {
  constructor(private readonly publicPlansService: PublicPlansService) {}

  @ApiOperation({ summary: 'List plans available for new subscriptions' })
  @ApiSuccessResponse({ description: 'Active plans retrieved successfully' })
  @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ResponseMessage('Active plans retrieved successfully')
  @Get()
  async listActivePlans(@Query() query: ApiListQueryDto) {
    return await this.publicPlansService.listActivePlans(query);
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
  @Get(':code')
  async getActivePlanByCode(@Param('code') code: string) {
    return await this.publicPlansService.getActivePlanByCode(code);
  }
}
