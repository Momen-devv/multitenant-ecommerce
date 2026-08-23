import { JobNames } from '../queue.constants';
import { StripeWebhookProcessor } from './stripe-webhook.processor';

describe('StripeWebhookProcessor', () => {
  const webhookService = {
    processEvent: jest.fn(),
    recoverDueEvents: jest.fn(),
  };

  let processor: StripeWebhookProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new StripeWebhookProcessor(webhookService as never);
  });

  it('routes event processing jobs to the webhook service', async () => {
    await processor.process({
      name: JobNames.STRIPE_WEBHOOK.PROCESS_EVENT,
      data: { eventId: 'evt_123' },
    } as never);

    expect(webhookService.processEvent).toHaveBeenCalledWith('evt_123');
  });

  it('routes recovery jobs to the webhook service', async () => {
    await processor.process({
      name: JobNames.STRIPE_WEBHOOK.RECOVER_EVENTS,
      data: {},
    } as never);

    expect(webhookService.recoverDueEvents).toHaveBeenCalledTimes(1);
  });
});
