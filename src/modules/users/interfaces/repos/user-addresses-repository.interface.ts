import type { UserAddress } from '@/infrastructure/database/schema/schema.types';

export type CreateUserAddressInput = {
  label: string;
  recipientName: string;
  recipientPhone: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  region?: string | null;
  postalCode?: string | null;
  countryCode: string;
  isDefault?: boolean;
};

export type UpdateUserAddressInput = Partial<
  Omit<CreateUserAddressInput, 'isDefault'>
>;

export interface IUserAddressesRepository {
  create(
    userId: string,
    input: CreateUserAddressInput,
    idempotencyKey: string,
  ): Promise<UserAddress>;
  findAll(userId: string): Promise<UserAddress[]>;
  update(
    userId: string,
    addressId: string,
    input: UpdateUserAddressInput,
  ): Promise<UserAddress | undefined>;
  delete(userId: string, addressId: string): Promise<boolean>;
  setDefault(
    userId: string,
    addressId: string,
  ): Promise<UserAddress | undefined>;
}
