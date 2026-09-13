/** Shared persistence and application limits for first-release commerce. */
export const MAX_ORDER_TOTAL_MINOR_UNITS = 2_000_000_000;
export const MAX_CART_ITEM_QUANTITY = 99;
export const MAX_CART_DISTINCT_VARIANTS = 50;
export const MAX_UNIT_PRICE_MINOR_UNITS = Math.floor(
  MAX_ORDER_TOTAL_MINOR_UNITS / MAX_CART_ITEM_QUANTITY,
);
export const MAX_LINE_TOTAL_MINOR_UNITS =
  MAX_UNIT_PRICE_MINOR_UNITS * MAX_CART_ITEM_QUANTITY;
/** PostgreSQL `integer` prices multiplied by the bounded Cart shape stay safe in JS. */
export const MAX_CART_UNIT_PRICE_MINOR_UNITS = 2_147_483_647;
export const MAX_CART_TOTAL_MINOR_UNITS =
  MAX_CART_UNIT_PRICE_MINOR_UNITS *
  MAX_CART_ITEM_QUANTITY *
  MAX_CART_DISTINCT_VARIANTS;
