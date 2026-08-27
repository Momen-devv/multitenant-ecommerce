import { SkipResponseTransform } from '@/common/decorators';
import {
  BadRequestException,
  Controller,
  Headers,
  HttpStatus,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import { StripeWebhookService } from '../services/stripe-webhook.service';

@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(private readonly stripeWebhookService: StripeWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @AllowAnonymous()
  @SkipResponseTransform()
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!request.rawBody || !signature) {
      throw new BadRequestException(
        'Stripe signature and raw request body are required',
      );
    }

    await this.stripeWebhookService.handle(request.rawBody, signature);
    return { received: true };
  }
}
