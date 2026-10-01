import { NotificationOutboxDispatcher } from './notification-outbox.dispatcher';

jest.mock('@nestjs/event-emitter', () => ({
  OnEvent: () => jest.fn(),
}));
jest.mock('../repos/notification-events.repository', () => ({
  NotificationEventsRepository: jest.fn(),
}));
jest.mock('../domain/operational-notification-intent', () => ({
  writeOperationalNotificationIntent: jest.fn(),
}));

describe('NotificationOutboxDispatcher', () => {
  it.each(['processed', 'dead_lettered', 'pending', 'processing'])(
    'publishes the source for a %s event at the appropriate stage',
    async (status) => {
      const markPublished = jest.fn().mockResolvedValue(undefined);
      const enqueue = jest.fn().mockResolvedValue(undefined);
      const terminal = status === 'processed' || status === 'dead_lettered';
      const reserveDue = jest.fn(() => {
        expect(markPublished).toHaveBeenCalledTimes(terminal ? 1 : 0);
        return Promise.resolve(
          terminal ? [] : [{ id: 'event-1', enqueueGeneration: 1 }],
        );
      });
      type Dependencies = ConstructorParameters<
        typeof NotificationOutboxDispatcher
      >;
      const dispatcher = new NotificationOutboxDispatcher(
        {
          claimDue: jest
            .fn()
            .mockResolvedValue([{ id: 'source-1', payload: {} }]),
          markPublished,
        } as unknown as Dependencies[0],
        {
          ensure: jest.fn().mockResolvedValue({ id: 'event-1', status }),
          reserveDue,
        } as unknown as Dependencies[1],
        { enqueue } as unknown as Dependencies[2],
        { error: jest.fn() } as unknown as Dependencies[3],
      );

      await dispatcher.dispatch();

      expect(reserveDue).toHaveBeenCalledTimes(1);
      expect(markPublished).toHaveBeenCalledTimes(1);
      expect(markPublished).toHaveBeenCalledWith('source-1');
      expect(enqueue).toHaveBeenCalledTimes(terminal ? 0 : 1);
    },
  );
});
