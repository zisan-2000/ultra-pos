// app/actions/reports.ts

"use server";

import { db } from "@/db/client";
import {
  sales,
  expenses,
  cashEntries,
  saleItems,
  products,
  shops,
} from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";

/* --------------------------------------------------
   DATE FILTER HELPER
-------------------------------------------------- */
function parseTimestampRange(from?: string, to?: string) {
  const startDate = from ? new Date(from) : undefined;
  const endDate = to ? new Date(to) : undefined;

  const start =
    startDate && !Number.isNaN(startDate.getTime()) ? startDate : undefined;
  const end = endDate && !Number.isNaN(endDate.getTime()) ? endDate : undefined;

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
  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, shopId),
  });
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

export async function getCogsTotal(shopId: string, from?: Date, to?: Date) {
  const rows = await db
    .select({
      qty: saleItems.quantity,
      buyPrice: products.buyPrice,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .innerJoin(products, eq(saleItems.productId, products.id))
    .where(
      and(
        eq(sales.shopId, shopId),
        from ? gte(sales.saleDate, from) : undefined,
        to ? lte(sales.saleDate, to) : undefined
      )
    );

  return sumCogs(rows as any);
}

export async function getCogsByDay(shopId: string, from?: Date, to?: Date) {
  const rows = await db
    .select({
      qty: saleItems.quantity,
      buyPrice: products.buyPrice,
      saleDate: sales.saleDate,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .innerJoin(products, eq(saleItems.productId, products.id))
    .where(
      and(
        eq(sales.shopId, shopId),
        from ? gte(sales.saleDate, from) : undefined,
        to ? lte(sales.saleDate, to) : undefined
      )
    );

  const byDay: Record<string, number> = {};
  rows.forEach((r: any) => {
    const day = new Date(r.saleDate).toISOString().split("T")[0];
    const qty = Number(r.qty ?? 0);
    const buy = Number(r.buyPrice ?? 0);
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
  const end = endDate && !Number.isNaN(endDate.getTime()) ? endDate : undefined;

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

  return db
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.shopId, shopId),
        start ? gte(sales.saleDate, start) : undefined,
        end ? lte(sales.saleDate, end) : undefined
      )
    );
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

  return db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.shopId, shopId),
        start ? gte(expenses.expenseDate, start) : undefined,
        end ? lte(expenses.expenseDate, end) : undefined
      )
    );
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

  return db
    .select()
    .from(cashEntries)
    .where(
      and(
        eq(cashEntries.shopId, shopId),
        start ? gte(cashEntries.createdAt, start) : undefined,
        end ? lte(cashEntries.createdAt, end) : undefined
      )
    );
}

/* --------------------------------------------------
   SALES SUMMARY (ALL TIME)
-------------------------------------------------- */
export async function getSalesSummary(shopId: string) {
  const rows = await db.select().from(sales).where(eq(sales.shopId, shopId));

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
  const rows = await db
    .select()
    .from(expenses)
    .where(eq(expenses.shopId, shopId));

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
  const rows = await db
    .select()
    .from(cashEntries)
    .where(eq(cashEntries.shopId, shopId));

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
