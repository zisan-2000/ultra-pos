import { Prisma } from "@prisma/client";
import { hasPermission, type UserContext } from "@/lib/rbac";

const DEFAULT_SALES_INVOICE_PREFIX = "INV";

function normalizeSequence(value: unknown) {
  const seq = Number(value ?? 0);
  if (!Number.isFinite(seq)) return 0;
  return Math.max(0, Math.floor(seq));
}

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

export function canIssueSalesInvoice(
  user: UserContext,
  salesInvoiceEnabled?: boolean | null
) {
  return Boolean(salesInvoiceEnabled) && hasPermission(user, "issue_sales_invoice");
}

export function canViewSalesInvoice(user: UserContext) {
  return hasPermission(user, "view_sales_invoice");
}

export async function allocateSalesInvoiceNumber(
  tx: Prisma.TransactionClient,
  shopId: string,
  issuedAt: Date = new Date()
) {
  const rows = await tx.$queryRaw<{ prefix: string | null; seq: unknown }[]>(
    Prisma.sql`
      UPDATE "shops"
      SET "next_sales_invoice_seq" = COALESCE("next_sales_invoice_seq", 1) + 1
      WHERE "id" = CAST(${shopId} AS uuid)
      RETURNING
        "sales_invoice_prefix" AS prefix,
        ("next_sales_invoice_seq" - 1)::int AS seq
    `
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Shop not found while issuing sales invoice");
  }

  const seq = normalizeSequence(row.seq);
  if (seq < 1) {
    throw new Error("Invalid sales invoice sequence");
  }

  return {
    invoiceNo: formatSalesInvoiceNo(row.prefix, seq, issuedAt),
    issuedAt,
  };
}
