"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";

/* --------------------------------------------------
   DATE FILTER HELPER
-------------------------------------------------- */
function parseTimestampRange(from?: string, to?: string) {
  const startDate = from ? new Date(from) : undefined;
  const endDate = to ? new Date(to) : undefined;

  const start =
    startDate && !Number.isNaN(startDate.getTime()) ? startDate : undefined;
  const end =
    endDate && !Number.isNaN(endDate.getTime()) ? endDate : undefined;

  if (start) start.setUTCHours(0, 0, 0, 0);
  if (end) end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

const SHOP_TYPES_WITH_COGS = new Set([
  "mini_grocery",
  "pharmacy",
  "clothing",
  "cosmetics_gift",
  "mini_wholesale",
]);

async function shopNeedsCogs(shopId: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return false;
  return SHOP_TYPES_WITH_COGS.has((shop as any).businessType);
}

function sumCogs(rows: { qty: any; buyPrice: any }[]) {
  return rows.reduce((sum, r) => {
    const qty = Number(r.qty ?? 0);
    const buy = Number(r.buyPrice ?? 0);
    if (!Number.isFinite(qty) || !Number.isFinite(buy)) return sum;
    return sum + qty * buy;
  }, 0);
}

export async function getCogsTotal(
  shopId: string,
  from?: Date,
  to?: Date
) {
  const rows = await prisma.saleItem.findMany({
    where: {
      sale: {
        shopId,
        status: { not: "VOIDED" },
        saleDate: {
          gte: from,
          lte: to,
        },
      },
    },
    select: {
      quantity: true,
      product: { select: { buyPrice: true } },
    },
  });

  const mapped = rows.map((r) => ({
    qty: r.quantity,
    buyPrice: r.product?.buyPrice,
  }));

  return sumCogs(mapped as any);
}

export async function getCogsByDay(
  shopId: string,
  from?: Date,
  to?: Date
) {
  const rows = await prisma.saleItem.findMany({
    where: {
      sale: {
        shopId,
        saleDate: {
          gte: from,
          lte: to,
        },
      },
    },
    select: {
      quantity: true,
      sale: { select: { saleDate: true } },
      product: { select: { buyPrice: true } },
    },
  });

  const byDay: Record<string, number> = {};
  rows.forEach((r: any) => {
    const day = new Date(r.sale!.saleDate).toISOString().split("T")[0];
    const qty = Number(r.quantity ?? 0);
    const buy = Number(r.product?.buyPrice ?? 0);
    if (!Number.isFinite(qty) || !Number.isFinite(buy)) return;
    byDay[day] = (byDay[day] || 0) + qty * buy;
  });
  return byDay;
}

function parseDateRange(from?: string, to?: string) {
  const startDate = from ? new Date(from) : undefined;
  const endDate = to ? new Date(to) : undefined;

  const start =
    startDate && !Number.isNaN(startDate.getTime()) ? startDate : undefined;
  const end =
    endDate && !Number.isNaN(endDate.getTime()) ? endDate : undefined;

  if (start) start.setUTCHours(0, 0, 0, 0);
  if (end) end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

/* --------------------------------------------------
   SALES LIST WITH DATE FILTER
-------------------------------------------------- */
export async function getSalesWithFilter(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  await assertShopAccess(shopId, user);
  const { start, end } = parseTimestampRange(from, to);

  return prisma.sale.findMany({
    where: {
      shopId,
      // exclude voided sales from reports
      status: { not: "VOIDED" },
      saleDate: {
        gte: start ?? undefined,
        lte: end ?? undefined,
      },
    },
  });
}

/* --------------------------------------------------
   EXPENSE LIST WITH DATE FILTER
-------------------------------------------------- */
export async function getExpensesWithFilter(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  await assertShopAccess(shopId, user);
  const { start, end } = parseDateRange(from, to);

  return prisma.expense.findMany({
    where: {
      shopId,
      expenseDate: {
        gte: start ?? undefined,
        lte: end ?? undefined,
      },
    },
  });
}

/* --------------------------------------------------
   CASHBOOK LIST WITH DATE FILTER
-------------------------------------------------- */
export async function getCashWithFilter(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  await assertShopAccess(shopId, user);
  const { start, end } = parseTimestampRange(from, to);

  return prisma.cashEntry.findMany({
    where: {
      shopId,
      createdAt: {
        gte: start ?? undefined,
        lte: end ?? undefined,
      },
    },
  });
}

/* --------------------------------------------------
   SALES SUMMARY (DATE AWARE)
-------------------------------------------------- */
export async function getSalesSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  await assertShopAccess(shopId, user);
  const { start, end } = parseTimestampRange(from, to);
  const [completed, voided] = await Promise.all([
    prisma.sale.findMany({
      where: {
        shopId,
        status: { not: "VOIDED" },
        saleDate: {
          gte: start ?? undefined,
          lte: end ?? undefined,
        },
      },
    }),
    prisma.sale.count({
      where: {
        shopId,
        status: "VOIDED",
        saleDate: {
          gte: start ?? undefined,
          lte: end ?? undefined,
        },
      },
    }),
  ]);

  const totalAmount = completed.reduce(
    (sum, row: any) => sum + Number(row.totalAmount || 0),
    0
  );

  const completedCount = completed.length;
  const voidedCount = voided;

  return {
    totalAmount,
    count: completedCount,
    completedCount,
    voidedCount,
  };
}
export async function getExpenseSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  await assertShopAccess(shopId, user);
  const { start, end } = parseDateRange(from, to);
  const rows = await prisma.expense.findMany({
    where: {
      shopId,
      expenseDate: {
        gte: start ?? undefined,
        lte: end ?? undefined,
      },
    },
  });

  const totalAmount = rows.reduce(
    (sum, row: any) => sum + Number(row.amount || 0),
    0
  );

  return {
    totalAmount,
    count: rows.length,
  };
}
export async function getCashSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  await assertShopAccess(shopId, user);
  const { start, end } = parseTimestampRange(from, to);
  const rows = await prisma.cashEntry.findMany({
    where: {
      shopId,
      createdAt: {
        gte: start ?? undefined,
        lte: end ?? undefined,
      },
    },
  });

  let totalIn = 0;
  let totalOut = 0;

  for (const row of rows as any[]) {
    const amt = Number(row.amount || 0);
    if (row.entryType === "IN") totalIn += amt;
    if (row.entryType === "OUT") totalOut += amt;
  }

  const balance = totalIn - totalOut;

  return {
    totalIn,
    totalOut,
    balance,
  };
}
export async function getProfitSummary(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  await assertShopAccess(shopId, user);
  const salesData = await getSalesSummary(shopId, from, to);
  const expenseData = await getExpenseSummary(shopId, from, to);
  const needsCogs = await shopNeedsCogs(shopId);
  const { start, end } = parseTimestampRange(from, to);
  const cogs = needsCogs ? await getCogsTotal(shopId, start, end) : 0;

  const totalExpense = expenseData.totalAmount + cogs;
  const profit = salesData.totalAmount - totalExpense;

  return {
    salesTotal: salesData.totalAmount,
    expenseTotal: totalExpense,
    profit,
    cogs,
  };
}
