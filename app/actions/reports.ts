"use server";

import { db } from "@/db/client";
import { sales, expenses, cashEntries } from "@/db/schema";
import { and, between, eq, gte, lte } from "drizzle-orm";

/* --------------------------------------------------
   DATE FILTER HELPER
-------------------------------------------------- */
function dateFilter(column: any, from?: string, to?: string) {
  if (from && to) return between(column, from, to);
  if (from) return gte(column, from);
  if (to) return lte(column, to);
  return undefined;
}

/* --------------------------------------------------
   SALES LIST WITH DATE FILTER
-------------------------------------------------- */
export async function getSalesWithFilter(
  shopId: string,
  from?: string,
  to?: string
) {
  return db
    .select()
    .from(sales)
    .where(and(eq(sales.shopId, shopId), dateFilter(sales.saleDate, from, to)));
}

/* --------------------------------------------------
   EXPENSE LIST WITH DATE FILTER
-------------------------------------------------- */
export async function getExpensesWithFilter(
  shopId: string,
  from?: string,
  to?: string
) {
  return db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.shopId, shopId),
        dateFilter(expenses.expenseDate, from, to)
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
  return db
    .select()
    .from(cashEntries)
    .where(
      and(
        eq(cashEntries.shopId, shopId),
        dateFilter(cashEntries.createdAt, from, to)
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

  const profit = salesData.totalAmount - expenseData.totalAmount;

  return {
    salesTotal: salesData.totalAmount,
    expenseTotal: expenseData.totalAmount,
    profit,
  };
}
