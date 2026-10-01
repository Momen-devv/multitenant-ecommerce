import { Controller, MessageEvent, Req, Session, Sse } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { CurrentUser } from '@/core/auth/auth.types';
import { NotificationStreamService } from '../services/notification-stream.service';

@ApiTags('Notifications')
@ApiCookieAuth()
@Controller('notifications')
export class NotificationStreamController {
  constructor(private readonly stream: NotificationStreamService) {}
  @Sse('stream')
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: 'Stream generic inbox changes',
    description:
      'Refetch inbox/count on connection, reconnect and every 60 seconds. No replay or Last-Event-ID support. Five connections per User across replicas; heartbeat every 25 seconds. 429 at capacity, 503 when Redis is unavailable.',
  })
  open(
    @Req() request: Request,
    @Session() session: CurrentUser,
  ): Promise<Observable<MessageEvent>> {
    return this.stream.open(request, session);
  }
}
