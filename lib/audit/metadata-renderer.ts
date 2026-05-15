// lib/audit/metadata-renderer.ts
//
// Turns a raw audit metadata JSON blob into a list of human-readable
// Bengali-labeled rows. Falls back to the raw key path when it doesn't
// recognise the field, so we never lose data — just hide ugliness.

export type MetadataRow = {
  label: string;
  value: string;
  /** Optional emphasis: "highlight" gets a slightly bolder treatment. */
  emphasis?: "default" | "highlight" | "muted";
};

// Bengali numerals helper for amounts.
const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const toBn = (value: string | number) =>
  String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

function formatMoney(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? "—");
  const fixed = num.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `৳ ${toBn(fixed)}`;
}

function formatNumber(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? "—");
  return toBn(num.toLocaleString("en-IN"));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// ── Known field labels ────────────────────────────────────────────
//
// When we recognise a metadata key, we map it to a Bengali label + a
// formatter. Anything unknown falls back to the catch-all renderer.

type FieldDef = {
  label: string;
  format?: (value: unknown) => string;
};

const KNOWN_FIELDS: Record<string, FieldDef> = {
  invoiceNo: { label: "ইনভয়েস নম্বর" },
  totalAmount: { label: "মোট টাকা", format: formatMoney },
  subtotal: { label: "সাবটোটাল", format: formatMoney },
  discountAmount: { label: "ছাড়", format: formatMoney },
  taxAmount: { label: "ট্যাক্স/VAT", format: formatMoney },
  paidNow: { label: "পরিশোধ", format: formatMoney },
  paymentMethod: { label: "পেমেন্ট পদ্ধতি", format: paymentMethodLabel },
  customerId: { label: "গ্রাহক আইডি" },
  customerName: { label: "গ্রাহকের নাম" },
  reason: { label: "কারণ" },
  oldSellPrice: { label: "আগের দাম", format: formatMoney },
  newSellPrice: { label: "নতুন দাম", format: formatMoney },
  oldStockQty: { label: "আগের মজুদ", format: formatNumber },
  newStockQty: { label: "নতুন মজুদ", format: formatNumber },
  stockQty: { label: "মজুদ", format: formatNumber },
  qty: { label: "পরিমাণ", format: formatNumber },
  amount: { label: "পরিমাণ", format: formatMoney },
  category: { label: "ক্যাটাগরি" },
  entryType: { label: "ধরন", format: entryTypeLabel },
  email: { label: "ইমেইল" },
  status: { label: "Status" },
  ipAddress: { label: "IP" },
  serialCount: { label: "সিরিয়াল সংখ্যা", format: formatNumber },
};

function paymentMethodLabel(value: unknown): string {
  const labels: Record<string, string> = {
    cash: "ক্যাশ",
    bkash: "বিকাশ",
    nagad: "নগদ",
    card: "কার্ড",
    bank_transfer: "ব্যাংক ট্রান্সফার",
    due: "বাকি",
  };
  const key = String(value ?? "").toLowerCase();
  return labels[key] ?? String(value ?? "—");
}

function entryTypeLabel(value: unknown): string {
  const key = String(value ?? "").toUpperCase();
  if (key === "IN") return "ক্যাশ ইন";
  if (key === "OUT") return "ক্যাশ আউট";
  return String(value ?? "—");
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "হ্যাঁ" : "না";
  if (typeof value === "string") return value;
  if (typeof value === "number") return formatNumber(value);
  if (Array.isArray(value)) return `${toBn(value.length)} টি আইটেম`;
  if (isPlainObject(value)) return "(বিস্তারিত নিচে)";
  return String(value);
}

/** Flat-render a metadata object into Bengali-labeled rows. */
export function renderMetadataRows(
  metadata: unknown,
  depth = 0,
  prefix = "",
): MetadataRow[] {
  if (!isPlainObject(metadata)) return [];

  const rows: MetadataRow[] = [];

  for (const [rawKey, rawValue] of Object.entries(metadata)) {
    if (rawValue === undefined) continue;

    const path = prefix ? `${prefix}.${rawKey}` : rawKey;
    const known = KNOWN_FIELDS[rawKey];

    // Recurse into nested objects (1 level deep) so before/after blocks
    // surface their fields with prefixed labels like "আগের মজুদ".
    if (isPlainObject(rawValue) && depth < 1) {
      const nestedPrefix = rawKey === "before" || rawKey === "after"
        ? `${rawKey === "before" ? "আগের" : "নতুন"}`
        : rawKey;
      const nested = renderMetadataRows(rawValue, depth + 1, nestedPrefix);
      rows.push(...nested);
      continue;
    }

    // Skip arrays of objects from row display; they're better shown
    // separately via renderMetadataLists().
    if (Array.isArray(rawValue) && rawValue.some(isPlainObject)) {
      rows.push({
        label: known?.label ?? humanizeKey(path),
        value: `${toBn(rawValue.length)} টি আইটেম (বিস্তারিত নিচে)`,
        emphasis: "muted",
      });
      continue;
    }

    const formatted = known?.format
      ? known.format(rawValue)
      : stringifyValue(rawValue);

    rows.push({
      label: known?.label ?? humanizeKey(path),
      value: formatted,
      emphasis: rawKey.toLowerCase().includes("amount") ||
                rawKey.toLowerCase().includes("price")
        ? "highlight"
        : "default",
    });
  }

  return rows;
}

/**
 * Extract any array-of-object lists in the metadata (e.g. sale.items) so the
 * detail view can render them as small tables instead of stringifying.
 */
export function renderMetadataLists(metadata: unknown): Array<{
  label: string;
  rows: Record<string, unknown>[];
}> {
  if (!isPlainObject(metadata)) return [];
  const lists: Array<{ label: string; rows: Record<string, unknown>[] }> = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every(isPlainObject)
    ) {
      lists.push({
        label: humanizeKey(key) === key ? key : humanizeKey(key),
        rows: value as Record<string, unknown>[],
      });
    }
  }

  return lists;
}

function humanizeKey(key: string): string {
  const replacements: Record<string, string> = {
    items: "পণ্য সমূহ",
    saleId: "বিক্রয় আইডি",
    productId: "পণ্য আইডি",
    variantId: "ভ্যারিয়েন্ট আইডি",
    cashEntryId: "ক্যাশ এন্ট্রি আইডি",
    affectedProductIds: "প্রভাবিত পণ্য",
    issuedAt: "ইস্যু সময়",
    name: "নাম",
    unitPrice: "একক মূল্য",
  };
  if (replacements[key]) return replacements[key];

  // Convert camelCase / snake_case to spaced words. Keep as-is if it's not
  // a recognisable English keyword so we don't garble Bengali keys.
  if (!/^[a-zA-Z0-9._]+$/.test(key)) return key;
  return key
    .replace(/[._]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
