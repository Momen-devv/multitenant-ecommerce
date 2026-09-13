import type { ArgumentsHost } from '@nestjs/common';
import { CheckoutConflictError } from '@/common/errors';
import { AllExceptionsFilter } from './http-exception.filter';

describe('AllExceptionsFilter', () => {
  const logger = { error: jest.fn(), warn: jest.fn() };
  const filter = new AllExceptionsFilter(logger as never);

  beforeEach(() => jest.resetAllMocks());

  it('returns 409 for a stale or invalid checkout without logging request data', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const request = {
      method: 'POST',
      url: '/api/v1/stores/shop/carts/cart/checkout',
    };

    filter.catch(
      new CheckoutConflictError('Cart changed during checkout.'),
      createHost(request, response),
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, success: false }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'POST /api/v1/stores/shop/carts/cart/checkout - 409',
      AllExceptionsFilter.name,
    );
  });
});

function createHost(request: object, response: object): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;
}
