import { Injectable } from '@nestjs/common';
import type { ActiveCheckoutResponseDto } from '../dto';
import type { ICartActiveCheckoutReader } from './carts.service';

/** Ticket 04 replaces this binding with its persisted checkout-attempt reader. */
@Injectable()
export class EmptyActiveCheckoutReader implements ICartActiveCheckoutReader {
  getActiveCheckout(): Promise<ActiveCheckoutResponseDto | null> {
    return Promise.resolve(null);
  }
}
