import { Prisma } from "@prisma/client";
import { hasPermission, type UserContext } from "@/lib/rbac";

const DEFAULT_QUEUE_TOKEN_PREFIX = "TK";

function normalizeSequence(value: unknown) {
  const seq = Number(value ?? 0);
  if (!Number.isFinite(seq)) return 0;
  return Math.max(0, Math.floor(seq));
}

export function sanitizeQueueTokenPrefix(value?: string | null) {
  const raw = value?.trim().toUpperCase() ?? "";
  const cleaned = raw.replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return cleaned || null;
}

export function resolveQueueTokenPrefix(value?: string | null) {
  return sanitizeQueueTokenPrefix(value) ?? DEFAULT_QUEUE_TOKEN_PREFIX;
}

export function formatQueueTokenLabel(prefix: string | null | undefined, sequence: number) {
  const normalizedPrefix = resolveQueueTokenPrefix(prefix);
  const safeSeq = Math.max(1, Math.floor(sequence));
  const serial = String(safeSeq).padStart(4, "0");
  return `${normalizedPrefix}-${serial}`;
}

export function canViewQueueBoard(user: UserContext) {
  return hasPermission(user, "view_queue_board");
}

export function canCreateQueueToken(user: UserContext) {
  return hasPermission(user, "create_queue_token");
}

export function canUpdateQueueTokenStatus(user: UserContext) {
  return hasPermission(user, "update_queue_token_status");
}

export function canPrintQueueToken(user: UserContext) {
  return hasPermission(user, "print_queue_token");
}

export async function allocateQueueTokenNumber(
  tx: Prisma.TransactionClient,
  shopId: string
) {
  const rows = await tx.$queryRaw<{ prefix: string | null; seq: unknown }[]>(
    Prisma.sql`
      UPDATE "shops"
      SET "next_queue_token_seq" = COALESCE("next_queue_token_seq", 1) + 1
      WHERE "id" = CAST(${shopId} AS uuid)
      RETURNING
        "queue_token_prefix" AS prefix,
        ("next_queue_token_seq" - 1)::int AS seq
    `
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Shop not found while issuing queue token");
  }

  const seq = normalizeSequence(row.seq);
  if (seq < 1) {
    throw new Error("Invalid queue token sequence");
  }

  return {
    tokenNo: seq,
    tokenLabel: formatQueueTokenLabel(row.prefix, seq),
  };
}
