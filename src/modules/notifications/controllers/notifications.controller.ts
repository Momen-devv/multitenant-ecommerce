import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Session,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CurrentUser } from '@/core/auth/auth.types';
import { ApiSuccessResponse } from '@/common/decorators/api-success-response.decorator';
import { ApiErrorResponse } from '@/common/decorators/api-error-response.decorator';
import {
  NotificationArchiveDto,
  NotificationListDto,
  NotificationPreferencesDto,
  NotificationScopeDto,
  NotificationPageDto,
  NotificationCountDto,
  NotificationMessageDto,
  NotificationMutationDto,
  NotificationPreferencesResultDto,
  NotificationPreferencesUpdatedDto,
} from '../dto/notifications.dto';
import { NotificationInboxRepository } from '../repos/notification-inbox.repository';
import { NotificationPreferencesRepository } from '../repos/notification-preferences.repository';
import { NotificationInboxGuard } from '../domain/notification-rollout';

@ApiTags('Notifications')
@ApiCookieAuth()
@Controller('notifications')
@UseGuards(NotificationInboxGuard)
@ApiErrorResponse(401, 'Authentication is required')
@ApiErrorResponse(400, 'Invalid request or preference batch')
@ApiErrorResponse(404, 'Notification or Store is inaccessible')
export class NotificationsController {
  constructor(
    private readonly inbox: NotificationInboxRepository,
    private readonly preferences: NotificationPreferencesRepository,
  ) {}

  @Get()
  @ApiSuccessResponse({
    description:
      'Visible notifications retained for 90 days from source occurrence. Email sent means provider acceptance, not inbox delivery. Recovery is limited to 180 days. Dead letters require separate audited operator intervention; no reset endpoint is provided. Sent and provider-ambiguous deliveries cannot be automatically replayed.',
    model: NotificationPageDto,
  })
  @ApiOperation({
    summary: 'List visible inbox messages',
    description:
      'Newest first by occurredAt and ID. Default excludes archived messages; deleted and messages older than 90 days are always excluded, including unread messages. Cursor must retain its original filters.',
  })
  list(@Session() session: CurrentUser, @Query() query: NotificationListDto) {
    return this.inbox.list(session.user.id, query);
  }

  @Get('unread-count')
  @ApiSuccessResponse({
    description: 'Unread count',
    model: NotificationCountDto,
  })
  @ApiOperation({ summary: 'Count visible unread, non-archived messages' })
  count(@Session() session: CurrentUser, @Query() query: NotificationScopeDto) {
    return this.inbox.count(session.user.id, query.storeId);
  }

  @Get('preferences')
  @ApiSuccessResponse({
    description: 'Effective preferences for the selected scope',
    model: NotificationPreferencesResultDto,
  })
  @ApiOperation({
    summary: 'Get effective email preferences, overrides and mandatory policy',
  })
  async getPreferences(
    @Session() session: CurrentUser,
    @Query() query: NotificationScopeDto,
  ) {
    return {
      items: await this.preferences.get(session.user.id, query.storeId ?? null),
    };
  }

  @Patch('preferences')
  @ApiSuccessResponse({
    description: 'Batch committed',
    model: NotificationPreferencesUpdatedDto,
  })
  @ApiOperation({
    summary: 'Atomically update email preferences',
    description:
      'Unsupported keys, duplicate keys and mandatory disable attempts reject the whole batch. null removes an override. Store scope requires current membership or customer/invitation history.',
  })
  async updatePreferences(
    @Session() session: CurrentUser,
    @Body() body: NotificationPreferencesDto,
  ) {
    await this.preferences.update(
      session.user.id,
      body.storeId ?? null,
      body.updates,
    );
    return { updated: body.updates.length };
  }

  @Post('read-all')
  @ApiSuccessResponse({
    description: 'Affected count',
    model: NotificationCountDto,
  })
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark all visible non-archived messages read',
    description:
      'Returns affected count. Messages committed after the statement snapshot remain unread.',
  })
  readAll(@Session() session: CurrentUser, @Body() body: NotificationScopeDto) {
    return this.inbox.readAll(session.user.id, body.storeId);
  }

  @Get(':id')
  @ApiSuccessResponse({
    description: 'Visible notification',
    model: NotificationMessageDto,
  })
  @ApiOperation({
    summary: 'Get a visible notification without marking it read',
    description:
      'Foreign or inaccessible IDs return 404. Invitation status reflects current state; null means the invitation is unavailable.',
  })
  get(
    @Session() session: CurrentUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.inbox.get(session.user.id, id);
  }

  @Patch(':id/read')
  @ApiSuccessResponse({
    description: 'Notification marked read',
    model: NotificationMutationDto,
  })
  @ApiOperation({ summary: 'Idempotently mark a visible notification read' })
  read(
    @Session() session: CurrentUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.inbox.mutate(session.user.id, id, 'read');
  }

  @Patch(':id/archive')
  @ApiSuccessResponse({
    description: 'Archive state updated',
    model: NotificationMutationDto,
  })
  @ApiOperation({
    summary: 'Archive or restore a visible notification',
    description:
      'Restoring an unread message returns it to unread counts. Deleted messages cannot be restored.',
  })
  archive(
    @Session() session: CurrentUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: NotificationArchiveDto,
  ) {
    return this.inbox.mutate(session.user.id, id, 'archive', body.archived);
  }

  @Delete(':id')
  @ApiSuccessResponse({
    description: 'Notification deleted',
    model: NotificationMutationDto,
  })
  @ApiOperation({
    summary: 'Soft-delete a visible notification',
    description:
      'Does not cancel email delivery. Updates recipient tombstone to prevent resurrection.',
  })
  delete(
    @Session() session: CurrentUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.inbox.mutate(session.user.id, id, 'delete');
  }
}
