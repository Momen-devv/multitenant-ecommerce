import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillingPortalService } from './billing-portal.service';

describe('BillingPortalService', () => {
  const stripe = {
    billingPortal: { sessions: { create: jest.fn() } },
  };
  const billingRepository = { findBillingCustomer: jest.fn() };
  let service: BillingPortalService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new BillingPortalService(
      stripe as never,
      billingRepository as never,
    );
  });

  it('creates a portal session for the store billing customer', async () => {
    billingRepository.findBillingCustomer.mockResolvedValue({
      stripeCustomerId: 'cus_123',
    });
    stripe.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.com/p/session/test',
    });

    await expect(
      service.createSession({
        storeId: 'store-1',
        returnUrl: 'https://app.example.com/settings/billing',
      }),
    ).resolves.toEqual({
      url: 'https://billing.stripe.com/p/session/test',
    });
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://app.example.com/settings/billing',
    });
  });

  it('rejects invalid return URLs before loading the customer', async () => {
    await expect(
      service.createSession({
        storeId: 'store-1',
        returnUrl: 'javascript:alert(1)',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(billingRepository.findBillingCustomer).not.toHaveBeenCalled();
  });

  it('rejects stores without a billing customer', async () => {
    billingRepository.findBillingCustomer.mockResolvedValue(undefined);

    await expect(
      service.createSession({
        storeId: 'store-1',
        returnUrl: 'https://app.example.com/settings/billing',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });
});
