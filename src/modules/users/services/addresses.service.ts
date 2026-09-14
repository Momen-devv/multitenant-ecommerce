import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserAddressLimitExceededError } from '../domain/user-address-limits';
import {
  USER_ADDRESSES_REPOSITORY,
  type IUserAddressesRepository,
} from '../interfaces/repos';
import type { CreateAddressDto, UpdateAddressDto } from '../dto';

@Injectable()
export class AddressesService {
  constructor(
    @Inject(USER_ADDRESSES_REPOSITORY)
    private readonly addressesRepository: IUserAddressesRepository,
  ) {}

  async createAddress(userId: string, dto: CreateAddressDto) {
    try {
      return await this.addressesRepository.create(userId, dto);
    } catch (error) {
      if (error instanceof UserAddressLimitExceededError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  listAddresses(userId: string) {
    return this.addressesRepository.findAll(userId);
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ) {
    const address = await this.addressesRepository.update(
      userId,
      addressId,
      dto,
    );
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  async deleteAddress(userId: string, addressId: string) {
    const deleted = await this.addressesRepository.delete(userId, addressId);
    if (!deleted) throw new NotFoundException('Address not found');
  }

  async setDefaultAddress(userId: string, addressId: string) {
    const address = await this.addressesRepository.setDefault(
      userId,
      addressId,
    );
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }
}
