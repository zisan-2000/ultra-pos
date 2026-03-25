export type SaleDiscountType = "amount" | "percent";

export type SaleDiscountInput = {
  type?: SaleDiscountType | string | null;
  value?: number | string | null;
};

export type SaleDiscountComputation = {
  subtotal: number;
  discountType: SaleDiscountType | null;
  discountValue: number;
  discountAmount: number;
  total: number;
  hasDiscount: boolean;
};

function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

export function sanitizeSaleDiscountType(
  value?: SaleDiscountType | string | null
): SaleDiscountType | null {
  if (value === "amount" || value === "percent") {
    return value;
  }
  return null;
}

export function sanitizeSaleDiscountValue(value?: number | string | null) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return roundMoney(numeric);
}

export function computeSaleDiscount(
  subtotalInput: number,
  input?: SaleDiscountInput | null
): SaleDiscountComputation {
  const subtotal = roundMoney(Math.max(Number(subtotalInput) || 0, 0));
  const discountType = sanitizeSaleDiscountType(input?.type);
  const discountValue = sanitizeSaleDiscountValue(input?.value);

  if (!discountType || subtotal <= 0 || discountValue <= 0) {
    return {
      subtotal,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      total: subtotal,
      hasDiscount: false,
    };
  }

  const rawDiscountAmount =
    discountType === "percent"
      ? subtotal * Math.min(discountValue, 100) / 100
      : discountValue;
  const discountAmount = roundMoney(Math.min(Math.max(rawDiscountAmount, 0), subtotal));
  const total = roundMoney(Math.max(subtotal - discountAmount, 0));

  return {
    subtotal,
    discountType,
    discountValue: discountType === "percent" ? Math.min(discountValue, 100) : discountValue,
    discountAmount,
    total,
    hasDiscount: discountAmount > 0,
  };
}
