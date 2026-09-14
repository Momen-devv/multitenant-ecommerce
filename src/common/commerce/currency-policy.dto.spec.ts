import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_ORDER_TOTAL_MINOR_UNITS } from './limits';
import { CreatePlanPriceDto } from '@/modules/plans/dto/create-plan-price.dto';
import { CreateStoreDto } from '@/modules/stores/dto/create-store.dto';
import { CreateProductVariantDto } from '@/modules/products/dto/request/create-product-variant.dto';
import { MAX_UNIT_PRICE_MINOR_UNITS } from './limits';

describe('new business money request validation', () => {
  it('defaults Store and plan-price currency at the application boundary', async () => {
    const store = plainToInstance(CreateStoreDto, { name: 'USD Store' });
    const planPrice = plainToInstance(CreatePlanPriceDto, {
      amount: 2900,
      interval: 'month',
    });

    await expect(validate(store)).resolves.toHaveLength(0);
    await expect(validate(planPrice)).resolves.toHaveLength(0);
    expect(store.currency).toBeUndefined();
    expect(planPrice.currency).toBeUndefined();
  });

  it.each([
    [CreateStoreDto, { name: 'USD Store', currency: 'eur' }],
    [CreatePlanPriceDto, { amount: 2900, interval: 'month', currency: 'eur' }],
  ])('rejects an explicitly supplied non-USD currency', async (Dto, body) => {
    const errors = await validate(plainToInstance(Dto, body));
    expect(errors).not.toHaveLength(0);
  });

  it('rejects invalid and out-of-domain minor-unit values', async () => {
    const invalidPlanAmounts = [
      -1,
      1.5,
      Infinity,
      MAX_ORDER_TOTAL_MINOR_UNITS + 1,
    ];
    for (const amount of invalidPlanAmounts) {
      const errors = await validate(
        plainToInstance(CreatePlanPriceDto, { amount, interval: 'month' }),
      );
      expect(errors).not.toHaveLength(0);
    }

    const variantErrors = await validate(
      plainToInstance(CreateProductVariantDto, {
        price: MAX_UNIT_PRICE_MINOR_UNITS + 1,
        inventoryPolicy: 'untracked',
      }),
    );
    expect(variantErrors).not.toHaveLength(0);
  });
});
