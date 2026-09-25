import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAddressDto } from './create-address.dto';

const validAddress = {
  label: 'Home',
  recipientName: 'Ahmed Ali',
  recipientPhone: '+201234567890',
  addressLine1: '12 Tahrir Square',
  city: 'Cairo',
  countryCode: 'EG',
};

describe('CreateAddressDto', () => {
  it('requires a delivery contact phone number', async () => {
    const addressWithoutPhone = {
      label: validAddress.label,
      recipientName: validAddress.recipientName,
      addressLine1: validAddress.addressLine1,
      city: validAddress.city,
      countryCode: validAddress.countryCode,
    };

    const errors = await validate(
      plainToInstance(CreateAddressDto, addressWithoutPhone),
    );

    expect(errors.some((error) => error.property === 'recipientPhone')).toBe(
      true,
    );
  });

  it('accepts an E.164 delivery contact phone number', async () => {
    await expect(
      validate(plainToInstance(CreateAddressDto, validAddress)),
    ).resolves.toHaveLength(0);
  });
});
