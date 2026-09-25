import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { CodedHttpError } from '@/common/errors';
import type { ActiveStoreContext } from '@/common/guards/active-store.guard';
import { USD_CURRENCY } from '@/common/commerce/currency';
import {
  CHECKOUT_ELIGIBILITY_READER,
  type ICheckoutEligibilityReader,
} from '@/modules/checkout/interfaces';
import {
  type StoreCheckoutOptionsResponseDto,
  type StoreCheckoutSettingsResponseDto,
  type UpdateStoreCheckoutSettingsDto,
} from '../dto';
import {
  StoreCheckoutSettingsRepository,
  type CheckoutSettingsWrite,
} from '../repos/store-checkout-settings.repository';

const DEFAULT_SETTINGS: Omit<StoreCheckoutSettingsResponseDto, 'onlineReady'> =
  {
    version: 0,
    currency: USD_CURRENCY,
    shippingFee: 0,
    deliveryCountries: [],
    shippingPolicy: null,
    cashOnDeliveryEnabled: false,
    onlineEnabled: false,
  };

@Injectable()
export class StoreCheckoutSettingsService {
  constructor(
    private readonly settings: StoreCheckoutSettingsRepository,
    @Inject(CHECKOUT_ELIGIBILITY_READER)
    private readonly eligibility: ICheckoutEligibilityReader,
  ) {}

  async getSettings(
    storeContext: ActiveStoreContext,
  ): Promise<StoreCheckoutSettingsResponseDto> {
    const [settings, eligibility] = await Promise.all([
      this.settings.findSettings(storeContext.storeId),
      this.eligibility.getForStore(storeContext.storeId),
    ]);
    return this.toSettingsResponse(settings, eligibility.onlinePaymentReady);
  }

  async updateSettings(
    storeContext: ActiveStoreContext,
    dto: UpdateStoreCheckoutSettingsDto,
  ): Promise<StoreCheckoutSettingsResponseDto> {
    const input = this.toWrite(dto);
    const saved =
      dto.version === 0
        ? await this.settings.insertInitial(storeContext.storeId, input)
        : await this.settings.updateAtVersion(
            storeContext.storeId,
            dto.version,
            input,
          );

    if (!saved) {
      throw new CodedHttpError(
        HttpStatus.CONFLICT,
        'STALE_VERSION',
        'Checkout settings were changed by another request. Read the latest version and retry.',
      );
    }

    const eligibility = await this.eligibility.getForStore(
      storeContext.storeId,
    );
    return this.toSettingsResponse(saved, eligibility.onlinePaymentReady);
  }

  async getCheckoutOptions(
    storeId: string,
  ): Promise<StoreCheckoutOptionsResponseDto> {
    const [settings, eligibility] = await Promise.all([
      this.settings.findSettings(storeId),
      this.eligibility.getForStore(storeId),
    ]);
    if (!eligibility.storeExists) {
      throw new CodedHttpError(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Store not found.',
      );
    }

    const configured = this.toSettingsResponse(
      settings,
      eligibility.onlinePaymentReady,
    );

    const eligible =
      configured.deliveryCountries.length > 0 && eligibility.canAcceptOrders;
    const paymentMethods: Array<'cash_on_delivery' | 'online'> = [
      ...(configured.cashOnDeliveryEnabled && eligible
        ? (['cash_on_delivery'] as const)
        : []),
      ...(configured.onlineEnabled && configured.onlineReady && eligible
        ? (['online'] as const)
        : []),
    ];

    return {
      currency: USD_CURRENCY,
      shippingFee: configured.shippingFee,
      deliveryCountries: configured.deliveryCountries,
      shippingPolicy: configured.shippingPolicy,
      paymentMethods,
      checkoutAvailable: paymentMethods.length > 0,
    };
  }

  private toWrite(dto: UpdateStoreCheckoutSettingsDto): CheckoutSettingsWrite {
    return {
      shippingFee: dto.shippingFee,
      deliveryCountries: dto.deliveryCountries,
      shippingPolicy: dto.shippingPolicy,
      cashOnDeliveryEnabled: dto.cashOnDeliveryEnabled,
      onlineEnabled: dto.onlineEnabled,
    };
  }

  private toSettingsResponse(
    settings: Awaited<
      ReturnType<StoreCheckoutSettingsRepository['findSettings']>
    >,
    onlineReady: boolean,
  ): StoreCheckoutSettingsResponseDto {
    if (!settings) return { ...DEFAULT_SETTINGS, onlineReady };
    return {
      version: settings.version,
      currency: USD_CURRENCY,
      shippingFee: settings.shippingFee,
      deliveryCountries: settings.deliveryCountries,
      shippingPolicy: settings.shippingPolicy,
      cashOnDeliveryEnabled: settings.cashOnDeliveryEnabled,
      onlineEnabled: settings.onlineEnabled,
      onlineReady,
    };
  }
}
