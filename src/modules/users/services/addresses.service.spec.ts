import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  UserAddressIdempotencyConflictError,
  MAX_USER_ADDRESSES,
  UserAddressLimitExceededError,
} from '../domain/user-address-limits';
import { USER_ADDRESSES_REPOSITORY } from '../interfaces/repos';
import { AddressesService } from './addresses.service';

describe('AddressesService', () => {
  let service: AddressesService;
  const repository = {
    create: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    setDefault: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    repository.findAll.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressesService,
        { provide: USER_ADDRESSES_REPOSITORY, useValue: repository },
      ],
    }).compile();
    service = module.get(AddressesService);
  });

  it('creates an address for the current user', async () => {
    const dto = {
      label: 'Home',
      recipientName: 'Ahmed Ali',
      recipientPhone: '+201234567890',
      addressLine1: '12 Tahrir Square',
      city: 'Cairo',
      countryCode: 'EG',
    };
    repository.create.mockResolvedValue({ id: 'address-1', ...dto });

    await expect(
      service.createAddress('user-1', dto, 'address-create-1'),
    ).resolves.toEqual({
      id: 'address-1',
      ...dto,
    });
    expect(repository.create).toHaveBeenCalledWith(
      'user-1',
      dto,
      'address-create-1',
    );
  });

  it('rejects creating an address when the user already has five', async () => {
    repository.create.mockRejectedValue(
      new UserAddressLimitExceededError(MAX_USER_ADDRESSES),
    );

    await expect(
      service.createAddress(
        'user-1',
        {
          label: 'Home',
          recipientName: 'Ahmed Ali',
          recipientPhone: '+201234567890',
          addressLine1: '12 Tahrir Square',
          city: 'Cairo',
          countryCode: 'EG',
        },
        'address-create-limit',
      )
    ).rejects.toThrow(
      new ConflictException('A user can have at most 5 saved addresses.'),
    );
  });

  it('rejects reusing an idempotency key with a different address request', async () => {
    repository.create.mockRejectedValue(
      new UserAddressIdempotencyConflictError(),
    );

    await expect(
      service.createAddress(
        'user-1',
        {
          label: 'Home',
          recipientName: 'Ahmed Ali',
          recipientPhone: '+201234567890',
          addressLine1: '12 Tahrir Square',
          city: 'Cairo',
          countryCode: 'EG',
        },
        'address-create-1',
      ),
    ).rejects.toThrow(
      new ConflictException(
        'Idempotency-Key was already used with a different address request.',
      ),
    );
  });

  it('does not expose another user’s address through updates', async () => {
    repository.update.mockResolvedValue(undefined);

    await expect(
      service.updateAddress('user-1', 'address-1', {
        city: 'Giza',
      }),
    ).rejects.toThrow(new NotFoundException('Address not found'));
    expect(repository.update).toHaveBeenCalledWith('user-1', 'address-1', {
      city: 'Giza',
    });
  });

  it('fails when the requested default address does not belong to the user', async () => {
    repository.setDefault.mockResolvedValue(undefined);

    await expect(
      service.setDefaultAddress('user-1', 'address-1'),
    ).rejects.toThrow(new NotFoundException('Address not found'));
  });

  it('fails when there is no owned address to delete', async () => {
    repository.delete.mockResolvedValue(false);

    await expect(service.deleteAddress('user-1', 'address-1')).rejects.toThrow(
      new NotFoundException('Address not found'),
    );
  });

  it('does not require a version to update an owned address', async () => {
    repository.update.mockResolvedValue(undefined);

    await expect(
      service.updateAddress('user-1', 'address-1', {
        city: 'Giza',
      }),
    ).rejects.toThrow(new NotFoundException('Address not found'));
    expect(repository.update).toHaveBeenCalledWith('user-1', 'address-1', {
      city: 'Giza',
    });
  });
});
