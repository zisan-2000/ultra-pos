import { Prisma } from "@prisma/client";
import { hasPermission, type UserContext } from "@/lib/rbac";

const DEFAULT_SALE_RETURN_PREFIX = "RET";

function normalizeSequence(value: unknown) {
  const seq = Number(value ?? 0);
  if (!Number.isFinite(seq)) return 0;
  return Math.max(0, Math.floor(seq));
}

export function sanitizeSaleReturnPrefix(value?: string | null) {
  const raw = value?.trim().toUpperCase() ?? "";
  const cleaned = raw.replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return cleaned || null;
}

export function resolveSaleReturnPrefix(value?: string | null) {
  return sanitizeSaleReturnPrefix(value) ?? DEFAULT_SALE_RETURN_PREFIX;
}

export function formatSaleReturnNo(
  prefix: string | null | undefined,
  sequence: number,
  createdAt: Date = new Date()
) {
  const normalizedPrefix = resolveSaleReturnPrefix(prefix);
  const safeSeq = Math.max(1, Math.floor(sequence));
  const yy = String(createdAt.getUTCFullYear()).slice(-2);
  const mm = String(createdAt.getUTCMonth() + 1).padStart(2, "0");
  const serial = String(safeSeq).padStart(6, "0");
  return `${normalizedPrefix}-${yy}${mm}-${serial}`;
}

export function canManageSaleReturn(user: UserContext) {
  return hasPermission(user, "create_sale_return");
}

export function canViewSaleReturn(user: UserContext) {
  return (
    hasPermission(user, "view_sale_return") || hasPermission(user, "view_sales")
  );
}

export async function allocateSaleReturnNumber(
  tx: Prisma.TransactionClient,
  shopId: string,
  createdAt: Date = new Date()
) {
  const rows = await tx.$queryRaw<{ prefix: string | null; seq: unknown }[]>(
    Prisma.sql`
      UPDATE "shops"
      SET "next_sale_return_seq" = COALESCE("next_sale_return_seq", 1) + 1
      WHERE "id" = CAST(${shopId} AS uuid)
      RETURNING
        "sale_return_prefix" AS prefix,
        ("next_sale_return_seq" - 1)::int AS seq
    `
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Shop not found while issuing sale return number");
  }

  const seq = normalizeSequence(row.seq);
  if (seq < 1) {
    throw new Error("Invalid sale return sequence");
  }

  return {
    returnNo: formatSaleReturnNo(row.prefix, seq, createdAt),
    createdAt,
  };
}
