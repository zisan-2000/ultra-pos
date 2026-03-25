export type SaleTaxInput = {
  enabled?: boolean | null;
  label?: string | null;
  rate?: number | string | null;
};

export type SaleTaxComputation = {
  enabled: boolean;
  label: string | null;
  rate: number;
  taxableAmount: number;
  taxAmount: number;
  total: number;
};

function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

export function sanitizeSaleTaxLabel(value?: string | null) {
  const trimmed = (value || "").trim().slice(0, 24);
  return trimmed || "VAT";
}

export function sanitizeSaleTaxRate(value?: number | string | null) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return roundMoney(Math.min(numeric, 100));
}

export function computeSaleTax(
  taxableAmountInput: number,
  input?: SaleTaxInput | null
): SaleTaxComputation {
  const taxableAmount = roundMoney(Math.max(Number(taxableAmountInput) || 0, 0));
  const enabled = Boolean(input?.enabled);
  const rate = sanitizeSaleTaxRate(input?.rate);
  const label = enabled && rate > 0 ? sanitizeSaleTaxLabel(input?.label) : null;

  if (!enabled || rate <= 0 || taxableAmount <= 0) {
    return {
      enabled: false,
      label: null,
      rate: 0,
      taxableAmount,
      taxAmount: 0,
      total: taxableAmount,
    };
  }

  const taxAmount = roundMoney((taxableAmount * rate) / 100);
  return {
    enabled: true,
    label,
    rate,
    taxableAmount,
    taxAmount,
    total: roundMoney(taxableAmount + taxAmount),
  };
}
