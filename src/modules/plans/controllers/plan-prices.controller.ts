import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { PlanPricesService } from '../services/plan-prices.service';
import { CreatePlanPriceDto } from '../dto';
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

@ApiTags('Plans')
@Roles([AuthRole.SUPER_ADMIN])
@Controller('admin/plans/:id/prices')
export class PlanPricesController {
  constructor(private readonly planPricesService: PlanPricesService) {}

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
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async addPlanPrice(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreatePlanPriceDto,
  ) {
    return await this.planPricesService.addPlanPrice(id, dto);
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
  @Post(':priceId/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivatePlanPrice(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('priceId', new ParseUUIDPipe()) priceId: string,
  ): Promise<void> {
    await this.planPricesService.deactivatePlanPrice(id, priceId);
  }
}
