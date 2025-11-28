import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sales, expenses, cashEntries } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";

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

  // Sales
  const salesRows = await db
    .select()
    .from(sales)
    .where(and(eq(sales.shopId, shopId), gte(sales.saleDate, todayStart)));

  const salesTotal = salesRows.reduce(
    (sum, s) => sum + Number(s.totalAmount || 0),
    0
  );

  // Expenses
  const expenseRows = await db
    .select()
    .from(expenses)
    .where(
      and(eq(expenses.shopId, shopId), gte(expenses.expenseDate, todayDate))
    );

  const expenseTotal = expenseRows.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  // Cashbook
  const cashRows = await db
    .select()
    .from(cashEntries)
    .where(
      and(eq(cashEntries.shopId, shopId), gte(cashEntries.createdAt, todayStart))
    );

  const totalIn = cashRows
    .filter((c) => c.entryType === "IN")
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);

  const totalOut = cashRows
    .filter((c) => c.entryType === "OUT")
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);

  const balance = totalIn - totalOut;

  return NextResponse.json({
    sales: Number(salesTotal.toFixed(2)) || 0,
    expenses: Number(expenseTotal.toFixed(2)) || 0,
    profit: Number((salesTotal - expenseTotal).toFixed(2)) || 0,
    balance: Number(balance.toFixed(2)) || 0,
  });
}
