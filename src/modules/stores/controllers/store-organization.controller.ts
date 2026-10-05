import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiSuccessResponse, ResponseMessage } from '@/common/decorators';
import { SetActiveStoreOrganizationDto } from '../dto';
import { StoreMembershipService } from '../services/store-membership.service';

@ApiTags('Store Membership')
@ApiCookieAuth('mte.session_token')
@Controller('stores/organization')
export class StoreOrganizationController {
  constructor(private readonly membershipService: StoreMembershipService) {}

  @Post('set-active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set or clear the current session active store organization',
  })
  @ApiSuccessResponse({
    description: 'Active organization updated successfully',
  })
  @ResponseMessage('Active organization updated successfully')
  async setActiveOrganization(
    @Body() dto: SetActiveStoreOrganizationDto,
    @Headers() headers: Record<string, string>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.membershipService.setActiveOrganization(
      dto,
      headers,
    );
    const cookies = result.headers.getSetCookie();
    if (cookies.length) response.append('Set-Cookie', cookies);
    response.setHeader('Cache-Control', 'no-store');
    return result.response;
  }
}
