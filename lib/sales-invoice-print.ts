export const SALES_INVOICE_PRINT_SIZE_OPTIONS = [
  {
    value: "thermal-80",
    label: "80mm POS Receipt",
    hint: "বেশিরভাগ thermal POS printer-এর জন্য",
  },
  {
    value: "thermal-58",
    label: "58mm POS Receipt",
    hint: "ছোট receipt printer-এর জন্য",
  },
  {
    value: "a4",
    label: "A4 Invoice",
    hint: "ডেস্কটপ প্রিন্টার বা accounting copy-এর জন্য",
  },
] as const;

export type SalesInvoicePrintSize =
  (typeof SALES_INVOICE_PRINT_SIZE_OPTIONS)[number]["value"];

export const DEFAULT_SALES_INVOICE_PRINT_SIZE: SalesInvoicePrintSize =
  "thermal-80";

const VALID_PRINT_SIZES = new Set<SalesInvoicePrintSize>(
  SALES_INVOICE_PRINT_SIZE_OPTIONS.map((option) => option.value)
);

export function sanitizeSalesInvoicePrintSize(
  value?: string | null
): SalesInvoicePrintSize {
  const normalized = (value || "").trim().toLowerCase() as SalesInvoicePrintSize;
  return VALID_PRINT_SIZES.has(normalized)
    ? normalized
    : DEFAULT_SALES_INVOICE_PRINT_SIZE;
}

export function isThermalSalesInvoicePrintSize(
  value?: string | null
): boolean {
  const resolved = sanitizeSalesInvoicePrintSize(value);
  return resolved === "thermal-80" || resolved === "thermal-58";
}
