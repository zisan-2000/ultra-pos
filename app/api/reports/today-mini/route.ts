// app/api/reports/today-mini/route.ts

import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sales, expenses, cashEntries } from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";

function startOfTodayUtc() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get("shopId");

  if (!shopId) {
    return NextResponse.json({ error: "shopId missing" }, { status: 400 });
  }

  const todayStart = startOfTodayUtc();
  const todayDate = todayStart.toISOString().slice(0, 10);

  // -------------------------------
  // SALES (Today)
  // -------------------------------
  const salesRows = await db
    .select()
    .from(sales)
    .where(and(eq(sales.shopId, shopId), gte(sales.saleDate, todayStart)));

  // -------------------------------
  // EXPENSES (Today)
  // -------------------------------
  const expenseRows = await db
    .select()
    .from(expenses)
    .where(
      and(eq(expenses.shopId, shopId), gte(expenses.expenseDate, todayDate))
    );

  // -------------------------------
  // CASHBOOK (Today)
  // -------------------------------
  const cashRows = await db
    .select()
    .from(cashEntries)
    .where(
      and(
        eq(cashEntries.shopId, shopId),
        gte(cashEntries.createdAt, todayStart)
      )
    );

  return NextResponse.json({
    sales: salesRows,
    expenses: expenseRows,
    cash: cashRows,
  });
}
