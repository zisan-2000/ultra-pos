const DEFAULT_SALES_INVOICE_PREFIX = "INV";

export function sanitizeSalesInvoicePrefix(value?: string | null) {
  const raw = value?.trim().toUpperCase() ?? "";
  const cleaned = raw.replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return cleaned || null;
}

export function resolveSalesInvoicePrefix(value?: string | null) {
  return sanitizeSalesInvoicePrefix(value) ?? DEFAULT_SALES_INVOICE_PREFIX;
}

export function formatSalesInvoiceNo(
  prefix: string | null | undefined,
  sequence: number,
  issuedAt: Date = new Date()
) {
  const normalizedPrefix = resolveSalesInvoicePrefix(prefix);
  const safeSeq = Math.max(1, Math.floor(sequence));
  const yy = String(issuedAt.getUTCFullYear()).slice(-2);
  const mm = String(issuedAt.getUTCMonth() + 1).padStart(2, "0");
  const serial = String(safeSeq).padStart(6, "0");
  return `${normalizedPrefix}-${yy}${mm}-${serial}`;
}

export function parseSalesInvoiceSequence(value?: string | null) {
  if (!value) return null;
  const match = value.trim().match(/-(\d{1,12})$/);
  if (!match) return null;
  const seq = Number.parseInt(match[1], 10);
  return Number.isFinite(seq) && seq > 0 ? seq : null;
}
