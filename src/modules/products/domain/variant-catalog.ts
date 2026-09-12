import { generateUUIDv7 } from '@/common/utils';

type VariantSelection = {
  optionValueId: string;
  value: string;
};

export function deriveVariantPresentation(
  selections: readonly VariantSelection[],
) {
  const optionSignature = selections
    .map((selection) => selection.optionValueId)
    .join('|');

  return {
    optionSignature,
    title: optionSignature
      ? selections
          .map((selection) => selection.value)
          .join(' / ')
          .slice(0, 200)
          .trimEnd()
      : 'Default',
  };
}

export function generateVariantIdentifiers() {
  return {
    sku: `SKU-${generateUUIDv7().replaceAll('-', '').toUpperCase()}`,
    barcode: `PV-${generateUUIDv7().replaceAll('-', '').toUpperCase()}`,
  };
}
