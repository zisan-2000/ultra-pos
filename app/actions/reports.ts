"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

  const toDateString = (d?: Date) =>
    d ? d.toISOString().split("T")[0] : undefined;

  return { start: toDateString(start), end: toDateString(end) };
}

/* --------------------------------------------------
   SALES LIST WITH DATE FILTER
-------------------------------------------------- */
export async function getSalesWithFilter(
  shopId: string,
  from?: string,
  to?: string
) {
  const { start, end } = parseTimestampRange(from, to);

  return prisma.sale.findMany({
    where: {
      shopId,
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
   SALES SUMMARY (ALL TIME)
-------------------------------------------------- */
export async function getSalesSummary(shopId: string) {
  const rows = await prisma.sale.findMany({ where: { shopId } });

  const totalAmount = rows.reduce(
    (sum, row: any) => sum + Number(row.totalAmount || 0),
    0
  );

  return {
    totalAmount,
    count: rows.length,
  };
}

/* --------------------------------------------------
   EXPENSE SUMMARY (ALL TIME)
-------------------------------------------------- */
export async function getExpenseSummary(shopId: string) {
  const rows = await prisma.expense.findMany({ where: { shopId } });

  const totalAmount = rows.reduce(
    (sum, row: any) => sum + Number(row.amount || 0),
    0
  );

  return {
    totalAmount,
    count: rows.length,
  };
}

/* --------------------------------------------------
   CASH SUMMARY (ALL TIME)
-------------------------------------------------- */
export async function getCashSummary(shopId: string) {
  const rows = await prisma.cashEntry.findMany({ where: { shopId } });

  let totalIn = 0;
  let totalOut = 0;

  for (const row of rows as any[]) {
    const amt = Number(row.amount || 0);
    if (row.entryType === "IN") totalIn += amt;
    else totalOut += amt;
  }

  return {
    totalIn,
    totalOut,
    balance: totalIn - totalOut,
  };
}

/* --------------------------------------------------
   PROFIT SUMMARY (ALL TIME)
-------------------------------------------------- */
export async function getProfitSummary(shopId: string) {
  const salesData = await getSalesSummary(shopId);
  const expenseData = await getExpenseSummary(shopId);
  const needsCogs = await shopNeedsCogs(shopId);
  const cogs = needsCogs ? await getCogsTotal(shopId) : 0;

  const totalExpense = expenseData.totalAmount + cogs;
  const profit = salesData.totalAmount - totalExpense;

  return {
    salesTotal: salesData.totalAmount,
    expenseTotal: totalExpense,
    profit,
    cogs,
  };
}
