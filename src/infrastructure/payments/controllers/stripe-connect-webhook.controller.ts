import { SkipResponseTransform } from '@/common/decorators';
import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '@/common/decorators';
import { StripeConnectWebhookService } from '../services/stripe-connect-webhook.service';

@Controller('webhooks/stripe-connect')
@ApiTags('Stripe Connect Webhooks')
export class StripeConnectWebhookController {
  constructor(private readonly service: StripeConnectWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @AllowAnonymous()
  @SkipThrottle()
  @SkipResponseTransform()
  @ApiOperation({
    operationId: 'receiveStripeConnectWebhook',
    summary: 'Receive a signed Stripe Connect event',
    description:
      'No session required. Requires the original signed raw JSON body. Account lifecycle events are processed here; purchase/refund/dispute receipts are retained for later payment handlers. Use Stripe sandbox delivery rather than unsigned Swagger requests.',
  })
  @ApiHeader({
    name: 'stripe-signature',
    required: true,
    schema: { type: 'string' },
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiResponse({
    status: 200,
    description: 'Event durably received',
    schema: {
      type: 'object',
      required: ['received'],
      properties: { received: { type: 'boolean', enum: [true] } },
    },
  })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Invalid signature, missing raw body, account or mismatched event mode',
  )
  @ApiErrorResponse(
    HttpStatus.SERVICE_UNAVAILABLE,
    'Durable storage failed; Stripe should retry',
  )
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!request.rawBody || !signature) {
      throw new BadRequestException(
        'Stripe signature and raw request body are required',
      );
    }

    await this.service.receive(request.rawBody, signature);
    return { received: true };
  }
}
