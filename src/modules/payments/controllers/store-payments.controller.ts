import {
  Controller,
  Body,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { OrgRoles } from '@thallesp/nestjs-better-auth';
import { seconds, Throttle } from '@nestjs/throttler';
import { OrganizationRole } from '@/common/enums';
import {
  ActiveStore,
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
} from '@/common/decorators';
import { StoreMembershipGuard } from '@/common/guards/store-membership.guard';
import { StorePaymentsService } from '../services/store-payments.service';
import {
  StorePaymentConnectionResponseDto,
  StorePaymentOnboardingRequestDto,
  StorePaymentOnboardingResponseDto,
} from '../dto/store-payment-connection.dto';
import type { ActiveStoreContext } from '@/common/guards/active-store.guard';

@ApiTags('Store Payments')
@ApiCookieAuth('mte.session_token')
@Controller('stores/me/payments')
@UseGuards(StoreMembershipGuard)
@ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, 'Request rate limit exceeded')
export class StorePaymentsController {
  constructor(private readonly service: StorePaymentsService) {}

  @Get('connection')
  @OrgRoles([OrganizationRole.OWNER, OrganizationRole.MANAGER])
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'getStorePaymentConnection',
    summary: 'Read connected Store payment readiness',
    description:
      'Owner or manager of the active organization. The Store need not be selling.',
  })
  @ApiSuccessResponse({
    description: 'Store payment connection retrieved successfully',
    model: StorePaymentConnectionResponseDto,
    example: {
      connected: false,
      ready: false,
      status: 'not_connected',
      chargesEnabled: false,
      payoutsEnabled: false,
      cardPaymentsActive: false,
      requirementsDue: [],
      disabledReason: null,
      checkedAt: null,
    },
  })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authenticated session required')
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Store not found for active organization',
  )
  @ApiErrorResponse(
    HttpStatus.FORBIDDEN,
    'Owner or manager membership required',
  )
  @ResponseMessage('Store payment connection retrieved successfully')
  @HttpCode(HttpStatus.OK)
  async connection(@ActiveStore() store: ActiveStoreContext) {
    return this.service.getConnection(store);
  }

  @Post('onboarding')
  @OrgRoles([OrganizationRole.OWNER])
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'createStorePaymentOnboarding',
    summary: 'Create a hosted Stripe Connect onboarding link',
    description:
      'Owner only. Replays reuse the Store account intent and may return a fresh link. On 503 retry with the same Idempotency-Key.',
  })
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Owner membership required')
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'PAYMENT_ACCOUNT_DEAUTHORIZED: automatic onboarding is disabled',
  )
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Stable printable ASCII key, 1–128 characters.',
    schema: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
      example: 'store-onboarding-1',
    },
  })
  @ApiBody({
    type: StorePaymentOnboardingRequestDto,
    examples: { empty: { value: {} } },
  })
  @ApiSuccessResponse({
    description: 'Hosted onboarding link created successfully',
    model: StorePaymentOnboardingResponseDto,
  })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'A valid Idempotency-Key is required',
  )
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authenticated session required')
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Store not found for active organization',
  )
  @ApiErrorResponse(
    HttpStatus.SERVICE_UNAVAILABLE,
    'Stripe is unavailable; retry with the same key',
  )
  @ResponseMessage('Stripe onboarding link created successfully')
  @HttpCode(HttpStatus.OK)
  async onboarding(
    @ActiveStore() store: ActiveStoreContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    // The empty DTO documents that provider/account identifiers are never caller inputs.
    // ValidationPipe rejects any unknown body fields.
    @Body() body: StorePaymentOnboardingRequestDto,
  ) {
    void body;
    return this.service.createOnboarding(store, idempotencyKey);
  }

  @Post('refresh')
  @OrgRoles([OrganizationRole.OWNER])
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ApiOperation({
    operationId: 'refreshStorePaymentConnection',
    summary: 'Refresh connected Store payment readiness from Stripe',
    description: 'Owner only. Repeatable; never creates a connected account.',
  })
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Owner membership required')
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Request body must be empty')
  @ApiBody({
    type: StorePaymentOnboardingRequestDto,
    examples: { empty: { value: {} } },
  })
  @ApiSuccessResponse({
    description: 'Store payment readiness refreshed successfully',
    model: StorePaymentConnectionResponseDto,
    example: {
      connected: true,
      ready: true,
      status: 'ready',
      chargesEnabled: true,
      payoutsEnabled: true,
      cardPaymentsActive: true,
      requirementsDue: [],
      disabledReason: null,
      checkedAt: '2026-09-15T12:00:00.000Z',
    },
  })
  @ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Authenticated session required')
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Store not found for active organization',
  )
  @ApiErrorResponse(HttpStatus.SERVICE_UNAVAILABLE, 'Stripe is unavailable')
  @ResponseMessage('Store payment readiness refreshed successfully')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @ActiveStore() store: ActiveStoreContext,
    @Body() body: StorePaymentOnboardingRequestDto,
  ) {
    void body;
    return this.service.refresh(store);
  }
}
