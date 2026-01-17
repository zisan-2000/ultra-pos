// app/actions/cash.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { cashSchema } from "@/lib/validators/cash";
import { requirePermission } from "@/lib/rbac";

import { Prisma } from "@prisma/client";
import { type CursorToken } from "@/lib/cursor-pagination";

function parseTimestampRange(from?: string, to?: string) {
  const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

  const parse = (value?: string, mode?: "start" | "end") => {
    if (!value) return undefined;
    if (isDateOnly(value)) {
      const tzOffset = "+06:00";
      const iso =
        mode === "end"
          ? `${value}T23:59:59.999${tzOffset}`
          : `${value}T00:00:00.000${tzOffset}`;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    if (mode === "start") d.setUTCHours(0, 0, 0, 0);
    if (mode === "end") d.setUTCHours(23, 59, 59, 999);
    return d;
  };

  return { start: parse(from, "start"), end: parse(to, "end") };
}

export async function getCashSummaryByRange(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  requirePermission(user, "view_cashbook");
  await assertShopAccess(shopId, user);

  const { start, end } = parseTimestampRange(from, to);
  const useUnbounded = !from && !to;

  const rows = await prisma.cashEntry.findMany({
    where: {
      shopId,
      createdAt: useUnbounded
        ? undefined
        : {
            gte: start,
            lte: end,
          },
    },
    select: {
      entryType: true,
      amount: true,
    },
  });

  const totals = rows.reduce(
    (acc, r) => {
      const amt = Number((r.amount as any)?.toString?.() ?? r.amount ?? 0);
      if (!Number.isFinite(amt)) return acc;
      if ((r.entryType || "").toUpperCase() === "IN") acc.totalIn += amt;
      else acc.totalOut += amt;
      return acc;
    },
    { totalIn: 0, totalOut: 0 }
  );

  return {
    totalIn: totals.totalIn,
    totalOut: totals.totalOut,
    balance: totals.totalIn - totals.totalOut,
    count: rows.length,
  };
}

export async function getCashByShopCursorPaginated({
  shopId,
  limit = 30,
  cursor,
  from,
  to,
}: {
  shopId: string;
  limit?: number;
  cursor?: { createdAt: Date; id: string } | null;
  from?: string;
  to?: string;
}): Promise<{
  items: any[];
  nextCursor: CursorToken | null;
  hasMore: boolean;
}> {
  const user = await requireUser();
  requirePermission(user, "view_cashbook");
  await assertShopAccess(shopId, user);

  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));

  const { start, end } = parseTimestampRange(from, to);
  const useUnbounded = !from && !to;

  const where: Prisma.CashEntryWhereInput = {
    shopId,
    createdAt: useUnbounded
      ? undefined
      : {
          gte: start,
          lte: end,
        },
  };

  if (cursor) {
    where.AND = [
      {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      },
    ];
  }

  const rows = await prisma.cashEntry.findMany({
    where,
    select: {
      id: true,
      shopId: true,
      entryType: true,
      amount: true,
      reason: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: safeLimit + 1,
  });

  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);

  const last = pageRows[pageRows.length - 1];
  const nextCursor: CursorToken | null =
    hasMore && last
      ? { createdAt: last.createdAt.toISOString(), id: last.id }
      : null;

  const items = pageRows.map((e) => ({
    id: e.id,
    shopId: e.shopId,
    entryType: (e.entryType as "IN" | "OUT") || "IN",
    amount: e.amount?.toString?.() ?? (e as any).amount ?? "0",
    reason: e.reason,
    createdAt: e.createdAt?.toISOString?.() ?? e.createdAt,
  }));

  return { items, nextCursor, hasMore };
}

// -------------------------------------------------
// CREATE CASH ENTRY
// -------------------------------------------------
export async function createCashEntry(input: any) {
  const parsed = cashSchema.parse(input);

  const user = await requireUser();
  requirePermission(user, "create_cash_entry");
  await assertShopAccess(parsed.shopId, user);

  await prisma.cashEntry.create({
    data: {
      shopId: parsed.shopId,
      entryType: parsed.entryType,
      amount: parsed.amount,
      reason: parsed.reason || "",
    },
  });

  return { success: true };
}

// -------------------------------------------------
// UPDATE CASH ENTRY
// -------------------------------------------------
export async function updateCashEntry(id: string, input: any) {
  const parsed = cashSchema.parse(input);

  const user = await requireUser();
  requirePermission(user, "update_cash_entry");
  await assertShopAccess(parsed.shopId, user);

  const existing = await prisma.cashEntry.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Cash entry not found");
  }
  if (existing.shopId !== parsed.shopId) {
    throw new Error("Unauthorized access to this cash entry");
  }

  await prisma.cashEntry.update({
    where: { id },
    data: {
      entryType: parsed.entryType,
      amount: parsed.amount,
      reason: parsed.reason || "",
    },
  });

  return { success: true };
}

// -------------------------------------------------
// GET ALL CASH ENTRIES FOR SHOP
// -------------------------------------------------
export async function getCashByShop(shopId: string) {
  const user = await requireUser();
  requirePermission(user, "view_cashbook");
  await assertShopAccess(shopId, user);

  return prisma.cashEntry.findMany({
    where: { shopId },
  });
}

// -------------------------------------------------
// GET SINGLE ENTRY
// -------------------------------------------------
export async function getCashEntry(id: string) {
  const user = await requireUser();
  requirePermission(user, "view_cashbook");

  const entry = await prisma.cashEntry.findUnique({
    where: { id },
  });

  if (!entry) {
    throw new Error("Cash entry not found");
  }

  await assertShopAccess(entry.shopId, user);

  return entry;
}

// -------------------------------------------------
// DELETE ENTRY
// -------------------------------------------------
export async function deleteCashEntry(id: string) {
  const user = await requireUser();
  requirePermission(user, "delete_cash_entry");

  const entry = await prisma.cashEntry.findUnique({ where: { id } });
  if (!entry) {
    throw new Error("Cash entry not found");
  }

  await assertShopAccess(entry.shopId, user);

  await prisma.cashEntry.delete({ where: { id } });
  return { success: true };
}
