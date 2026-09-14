import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Session,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import type { CurrentUser } from '@/core/auth/auth.types';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
} from '@/common/decorators';
import {
  AddressListResponseDto,
  AddressResponseDto,
  CreateAddressDto,
  UpdateAddressDto,
} from '../dto';
import { AddressesService } from '../services/addresses.service';

@ApiTags('Addresses')
@ApiCookieAuth()
@Controller('users/addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({ summary: 'List the current user’s saved addresses' })
  @ApiSuccessResponse({
    description: 'Addresses retrieved successfully',
    model: AddressListResponseDto,
  })
  @ResponseMessage('Addresses retrieved successfully')
  async list(@Session() session: CurrentUser) {
    const items = await this.addressesService.listAddresses(session.user.id);
    return { items };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Save a delivery address for the current user' })
  @ApiSuccessResponse({
    status: HttpStatus.CREATED,
    description: 'Address created successfully',
    model: AddressResponseDto,
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'A user can have at most 5 saved addresses.',
  )
  @ResponseMessage('Address created successfully')
  create(@Session() session: CurrentUser, @Body() dto: CreateAddressDto) {
    return this.addressesService.createAddress(session.user.id, dto);
  }

  @Patch(':addressId')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Update one of the current user’s saved addresses' })
  @ApiSuccessResponse({
    description: 'Address updated successfully',
    model: AddressResponseDto,
  })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Address not found.')
  @ResponseMessage('Address updated successfully')
  update(
    @Session() session: CurrentUser,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.updateAddress(session.user.id, addressId, dto);
  }

  @Patch(':addressId/default')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'Set a saved address as the default delivery address',
  })
  @ApiSuccessResponse({
    description: 'Default address updated successfully',
    model: AddressResponseDto,
  })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Address not found.')
  @ResponseMessage('Default address updated successfully')
  setDefault(
    @Session() session: CurrentUser,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ) {
    return this.addressesService.setDefaultAddress(session.user.id, addressId);
  }

  @Delete(':addressId')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Delete one of the current user’s saved addresses' })
  @ApiSuccessResponse({ description: 'Address deleted successfully' })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Address not found.')
  @ResponseMessage('Address deleted successfully')
  delete(
    @Session() session: CurrentUser,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ) {
    return this.addressesService.deleteAddress(session.user.id, addressId);
  }
}
