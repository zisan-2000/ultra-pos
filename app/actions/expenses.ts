// app/actions/expenses.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { expenseSchema } from "@/lib/validators/expense";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";

import { Prisma } from "@prisma/client";
import { type CursorToken } from "@/lib/cursor-pagination";

function normalizeExpenseDate(raw?: string | null) {
  const trimmed = raw?.trim();
  const date = trimmed ? new Date(trimmed) : new Date();
  if (Number.isNaN(date.getTime())) {
    // fallback to today's date if parsing fails
    const fallback = new Date();
    fallback.setUTCHours(0, 0, 0, 0);
    return fallback;
  }
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function parseTimestampRange(from?: string, to?: string) {
  const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

  const parse = (value?: string, mode?: "start" | "end") => {
    if (!value) return undefined;
    if (isDateOnly(value)) {
      const iso =
        mode === "end"
          ? `${value}T23:59:59.999Z`
          : `${value}T00:00:00.000Z`;
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

export async function getExpenseSummaryByRange(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  requirePermission(user, "view_expenses");
  await assertShopAccess(shopId, user);

  const { start, end } = parseTimestampRange(from, to);
  const useUnbounded = !from && !to;

  const agg = await prisma.expense.aggregate({
    where: {
      shopId,
      expenseDate: useUnbounded
        ? undefined
        : {
            gte: start,
            lte: end,
          },
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  return {
    totalAmount: agg._sum.amount?.toString?.() ?? "0",
    count: agg._count._all ?? 0,
  };
}

export async function getExpensesByShopCursorPaginated({
  shopId,
  limit = 20,
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
  requirePermission(user, "view_expenses");
  await assertShopAccess(shopId, user);

  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));

  const { start, end } = parseTimestampRange(from, to);
  const useUnbounded = !from && !to;

  const where: Prisma.ExpenseWhereInput = {
    shopId,
    expenseDate: useUnbounded
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

  const rows = await prisma.expense.findMany({
    where,
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
    amount: e.amount?.toString?.() ?? (e as any).amount ?? "0",
    category: e.category,
    note: e.note,
    expenseDate: e.expenseDate?.toISOString?.() ?? e.expenseDate,
    createdAt: e.createdAt?.toISOString?.() ?? e.createdAt,
  }));

  return { items, nextCursor, hasMore };
}

// -------------------------------------------------
// CREATE EXPENSE
// -------------------------------------------------
export async function createExpense(input: any) {
  const parsed = expenseSchema.parse(input);

  const user = await requireUser();
  requirePermission(user, "create_expense");
  await assertShopAccess(parsed.shopId, user);

  await prisma.$transaction(async (tx) => {
    const expenseDate = normalizeExpenseDate(parsed.expenseDate);
    const created = await tx.expense.create({
      data: {
        shopId: parsed.shopId,
        amount: parsed.amount,
        category: parsed.category,
        expenseDate,
        note: parsed.note || "",
      },
    });

    await tx.cashEntry.create({
      data: {
        shopId: parsed.shopId,
        entryType: "OUT",
        amount: created.amount,
        reason: `Expense: ${created.category} (#${created.id})`,
        createdAt: expenseDate,
      },
    });
  });

  return { success: true };
}

// -------------------------------------------------
// UPDATE EXPENSE
// -------------------------------------------------
export async function updateExpense(id: string, input: any) {
  const parsed = expenseSchema.parse(input);

  const user = await requireUser();
  requirePermission(user, "update_expense");
  await assertShopAccess(parsed.shopId, user);

  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Expense not found");
  }
  if (existing.shopId !== parsed.shopId) {
    throw new Error("Unauthorized access to this expense");
  }

  const prevAmount = Number(existing.amount);
  const nextAmount = Number(parsed.amount);
  const delta = Number((nextAmount - prevAmount).toFixed(2));

  await prisma.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id },
      data: {
        amount: parsed.amount,
        category: parsed.category,
        note: parsed.note || "",
        expenseDate: normalizeExpenseDate(parsed.expenseDate),
      },
    });

    if (delta !== 0) {
      await tx.cashEntry.create({
        data: {
          shopId: parsed.shopId,
          entryType: delta > 0 ? "OUT" : "IN",
          amount: Math.abs(delta).toFixed(2),
          reason: `Expense adjustment #${id}`,
        },
      });
    }
  });

  return { success: true };
}

// -------------------------------------------------
// GET EXPENSES BY SHOP
// -------------------------------------------------
export async function getExpensesByShop(shopId: string) {
  const user = await requireUser();
  requirePermission(user, "view_expenses");
  await assertShopAccess(shopId, user);

  return prisma.expense.findMany({
    where: { shopId },
  });
}

// -------------------------------------------------
// GET SINGLE EXPENSE
// -------------------------------------------------
export async function getExpense(id: string) {
  const user = await requireUser();
  requirePermission(user, "view_expenses");

  const expense = await prisma.expense.findUnique({
    where: { id },
  });

  if (!expense) {
    throw new Error("Expense not found");
  }

  await assertShopAccess(expense.shopId, user);

  return expense;
}

// -------------------------------------------------
// DELETE EXPENSE
// -------------------------------------------------
export async function deleteExpense(id: string) {
  const user = await requireUser();
  requirePermission(user, "delete_expense");

  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) {
    throw new Error("Expense not found");
  }

  await assertShopAccess(expense.shopId, user);

  await prisma.$transaction(async (tx) => {
    await tx.cashEntry.create({
      data: {
        shopId: expense.shopId,
        entryType: "IN",
        amount: expense.amount,
        reason: `Reversal of expense #${expense.id}`,
      },
    });
    await tx.expense.delete({ where: { id } });
  });
  return { success: true };
}
