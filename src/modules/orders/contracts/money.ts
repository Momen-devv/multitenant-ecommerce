import {
  MAX_CART_ITEM_QUANTITY,
  MAX_ORDER_TOTAL_MINOR_UNITS,
  MAX_UNIT_PRICE_MINOR_UNITS,
} from '@/common/commerce/limits';

export {
  MAX_CART_DISTINCT_VARIANTS,
  MAX_CART_ITEM_QUANTITY,
  MAX_LINE_TOTAL_MINOR_UNITS,
  MAX_ORDER_TOTAL_MINOR_UNITS,
  MAX_UNIT_PRICE_MINOR_UNITS,
} from '@/common/commerce/limits';

/** Monetary values are integer minor units; they are never rounded. */

function assertMinorUnits(amount: number, name: string): void {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(
      `${name} must be a non-negative integer minor-unit amount`,
    );
  }
}

export function calculateLineTotal(
  unitPrice: number,
  quantity: number,
): number {
  if (
    !Number.isSafeInteger(unitPrice) ||
    unitPrice < 1 ||
    unitPrice > MAX_UNIT_PRICE_MINOR_UNITS
  ) {
    throw new RangeError(
      `unit price must be an integer between 1 and ${MAX_UNIT_PRICE_MINOR_UNITS}`,
    );
  }
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_CART_ITEM_QUANTITY
  ) {
    throw new RangeError(
      `quantity must be an integer between 1 and ${MAX_CART_ITEM_QUANTITY}`,
    );
  }

  return unitPrice * quantity;
}

export function sumMinorUnits(...amounts: number[]): number {
  const total = amounts.reduce((sum, amount) => {
    assertMinorUnits(amount, 'amount');
    const next = sum + amount;
    if (next > MAX_ORDER_TOTAL_MINOR_UNITS) {
      throw new RangeError(
        `total must not exceed ${MAX_ORDER_TOTAL_MINOR_UNITS} minor units`,
      );
    }
    return next;
  }, 0);

  return total;
}
