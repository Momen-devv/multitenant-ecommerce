import { Module } from '@nestjs/common';
import { OutboxRepository } from './outbox.repository';

@Module({
  providers: [OutboxRepository],
  exports: [OutboxRepository],
})
export class OutboxModule {}
