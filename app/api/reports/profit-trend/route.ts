import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sales, expenses } from "@/db/schema";
import { and, between, eq, gte, lte } from "drizzle-orm";

function dateFilter(col: any, from?: string, to?: string) {
  if (from && to) return between(col, from, to);
  if (from) return gte(col, from);
  if (to) return lte(col, to);
  return undefined;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get("shopId")!;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;

  const salesRows = await db
    .select()
    .from(sales)
    .where(and(eq(sales.shopId, shopId), dateFilter(sales.saleDate, from, to)));

  const expenseRows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.shopId, shopId),
        dateFilter(expenses.expenseDate, from, to)
      )
    );

  const format = (d: string) => new Date(d).toISOString().split("T")[0];

  const map: Record<string, { sales: number; expense: number }> = {};

  salesRows.forEach((s: any) => {
    const day = format(s.saleDate);
    if (!map[day]) map[day] = { sales: 0, expense: 0 };
    map[day].sales += Number(s.totalAmount);
  });

  expenseRows.forEach((e: any) => {
    const day = format(e.expenseDate);
    if (!map[day]) map[day] = { sales: 0, expense: 0 };
    map[day].expense += Number(e.amount);
  });

  const data = Object.entries(map).map(([date, v]) => ({
    date,
    sales: v.sales,
    expense: v.expense,
  }));

  return NextResponse.json({ data });
}
