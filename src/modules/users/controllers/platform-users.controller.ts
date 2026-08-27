import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Session,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@thallesp/nestjs-better-auth';
import { seconds, Throttle } from '@nestjs/throttler';
import { AuthRole } from '@/common/enums';
import { ApiErrorResponse, ApiSuccessResponse } from '@/common/decorators';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import type { CurrentUser } from '@/core/auth/auth.types';
import {
  BanPlatformUserDto,
  CreatePlatformUserDto,
  ListPlatformUsersDto,
  PlatformUserReasonDto,
  SetPlatformUserRoleDto,
  UpdatePlatformUserDto,
} from '../dto';
import { PlatformUsersService } from '../services/platform-users.service';

@ApiTags('Platform Users')
@ApiCookieAuth()
@Roles([AuthRole.PLATFORM_SUPER_ADMIN])
@ApiErrorResponse(HttpStatus.UNAUTHORIZED, 'Unauthorized')
@ApiErrorResponse(HttpStatus.FORBIDDEN, 'Platform super-admin role required')
@Controller('platform/users')
export class PlatformUsersController {
  constructor(private readonly platformUsersService: PlatformUsersService) {}

  @ApiOperation({ summary: 'List platform users' })
  @ApiSuccessResponse({ description: 'Users retrieved successfully' })
  @ResponseMessage('Users retrieved successfully')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @Get()
  listUsers(
    @Query() query: ListPlatformUsersDto,
    @Headers() headers: Record<string, string>,
  ) {
    return this.platformUsersService.listUsers(query, headers);
  }

  @ApiOperation({ summary: 'Create a platform user account' })
  @ApiSuccessResponse({
    status: HttpStatus.CREATED,
    description: 'User created successfully',
  })
  @ResponseMessage('User created successfully')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post()
  createUser(
    @Body() dto: CreatePlatformUserDto,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    return this.platformUsersService.createUser(dto, session.user.id, headers);
  }

  @ApiOperation({ summary: 'Get a platform user' })
  @ApiSuccessResponse({ description: 'User retrieved successfully' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ResponseMessage('User retrieved successfully')
  @Get(':userId')
  getUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Headers() headers: Record<string, string>,
  ) {
    return this.platformUsersService.getUser(userId, headers);
  }

  @ApiOperation({ summary: 'Update approved platform user profile fields' })
  @ApiSuccessResponse({ description: 'User updated successfully' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ResponseMessage('User updated successfully')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Patch(':userId')
  updateUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdatePlatformUserDto,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    return this.platformUsersService.updateUser(
      userId,
      dto,
      session.user.id,
      headers,
    );
  }

  @ApiOperation({ summary: 'Replace a platform user role' })
  @ApiSuccessResponse({ description: 'User role updated successfully' })
  @ResponseMessage('User role updated successfully')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Put(':userId/role')
  setRole(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: SetPlatformUserRoleDto,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    return this.platformUsersService.setRole(
      userId,
      dto,
      session.user.id,
      headers,
    );
  }

  @ApiOperation({ summary: 'Ban a platform user and revoke their sessions' })
  @ApiSuccessResponse({ description: 'User banned successfully' })
  @ResponseMessage('User banned successfully')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post(':userId/ban')
  banUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: BanPlatformUserDto,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    return this.platformUsersService.banUser(
      userId,
      dto,
      session.user.id,
      headers,
    );
  }

  @ApiOperation({ summary: 'Remove a platform user ban' })
  @ApiSuccessResponse({ description: 'User unbanned successfully' })
  @ResponseMessage('User unbanned successfully')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post(':userId/unban')
  unbanUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: PlatformUserReasonDto,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    return this.platformUsersService.unbanUser(
      userId,
      dto.reason,
      session.user.id,
      headers,
    );
  }

  @ApiOperation({ summary: 'List a platform user sessions' })
  @ApiSuccessResponse({ description: 'User sessions retrieved successfully' })
  @ResponseMessage('User sessions retrieved successfully')
  @Get(':userId/sessions')
  listUserSessions(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Headers() headers: Record<string, string>,
  ) {
    return this.platformUsersService.listUserSessions(userId, headers);
  }

  @ApiOperation({ summary: 'Revoke all sessions for a platform user' })
  @ApiSuccessResponse({ description: 'User sessions revoked successfully' })
  @ResponseMessage('User sessions revoked successfully')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Delete(':userId/sessions')
  revokeUserSessions(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: PlatformUserReasonDto,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    return this.platformUsersService.revokeUserSessions(
      userId,
      dto.reason,
      session.user.id,
      headers,
    );
  }

  @ApiOperation({ summary: 'Revoke one session for a platform user' })
  @ApiSuccessResponse({ description: 'User session revoked successfully' })
  @ResponseMessage('User session revoked successfully')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Delete(':userId/sessions/:sessionId')
  revokeUserSession(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() dto: PlatformUserReasonDto,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    return this.platformUsersService.revokeUserSession(
      userId,
      sessionId,
      dto.reason,
      session.user.id,
      headers,
    );
  }

  @ApiOperation({ summary: 'Deactivate a platform user account' })
  @ApiSuccessResponse({ description: 'User deactivated successfully' })
  @ResponseMessage('User deactivated successfully')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post(':userId/deactivate')
  deactivateUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: PlatformUserReasonDto,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    return this.platformUsersService.deactivateUser(
      userId,
      dto.reason,
      session.user.id,
      headers,
    );
  }

  @ApiOperation({ summary: 'Reactivate a platform user account' })
  @ApiSuccessResponse({ description: 'User reactivated successfully' })
  @ResponseMessage('User reactivated successfully')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post(':userId/reactivate')
  reactivateUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: PlatformUserReasonDto,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    return this.platformUsersService.reactivateUser(
      userId,
      dto.reason,
      session.user.id,
      headers,
    );
  }

  @ApiOperation({ summary: 'Email a password-reset link to a platform user' })
  @ApiSuccessResponse({ description: 'Password reset requested successfully' })
  @ResponseMessage('Password reset requested successfully')
  @Throttle({ default: { limit: 3, ttl: seconds(300) } })
  @Post(':userId/password-reset')
  @HttpCode(HttpStatus.ACCEPTED)
  requestPasswordReset(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: PlatformUserReasonDto,
    @Session() session: CurrentUser,
    @Headers() headers: Record<string, string>,
  ) {
    return this.platformUsersService.requestPasswordReset(
      userId,
      dto,
      session.user.id,
      headers,
    );
  }
}
